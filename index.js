import 'websocket-polyfill'
import pkg from 'nostr-tools'

const relayInit = pkg.relayInit
let pk = process.env.PUBLIC_KEY

const relayFromUrls = process.env.RELAY_FROM_URLS.split(',')
const relayToUrl = process.env.RELAY_TO_URL

const eventsReceived = []

async function run() {
  for (const relayUrl of relayFromUrls) {
    const relayFrom = await connect(relayUrl)
    if (!relayFrom) {
      continue // skip this relay and move to the next one
    }
    const relayTo = await connect(relayToUrl)
    if (!relayTo) {
      await relayFrom.close()
      continue // skip this relay and move to the next one
    }

    const eventsToMove = []

    relayFrom.on('connect', () => {
      console.log(`connected to ${relayFrom.url}`)
    })

    relayTo.on('connect', () => {
      console.log(`connected to ${relayTo.url}`)
    })

    const sub = relayFrom.sub([
      {
        authors: [pk],
      }
    ])
    sub.on('event', event => {
      if(eventsReceived.indexOf(event.id) === -1) {
        eventsToMove.push(event)
        eventsReceived.push(event.id)
      }
    })
    sub.on('eose', async () => {
      sub.unsub()

      console.log(`got ${eventsToMove.length} events from ${relayFrom.url}`)

      for (const [index, event] of eventsToMove.entries()) {
        try {
          await relayTo.publish(event)
          console.log(`${relayTo.url} has accepted our event from ${relayFrom.url} on ${new Date(event.created_at * 1000).toISOString()} of kind ${event.kind} and ID ${event.id}`)
        } catch (error) {
          console.error(`could not publish to: ${relayTo.url}, skipping event ${event.id}.`)
          continue // skip this event and move to the next one
        }

        if(index === eventsToMove.length - 1) {
          console.log(`done with ${relayFrom.url}`)
          await relayFrom.close()
          await relayTo.close()
        }
      }
    })
  }
}

async function connect(relayUrl) {
  const relay = relayInit(relayUrl)

  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      relay.close()
      console.error(`timed out while connecting to: ${relayUrl}, skipping.`)
      resolve(null) // signal unsuccessful attempt
    }, 5000) // 5 seconds timeout

    relay.on('connect', () => {
      clearTimeout(timeoutId)
      console.log(`connected to: ${relayUrl}.`)
      resolve(relay) // signal successful attempt
    })

    relay.on('error', (error) => {
      clearTimeout(timeoutId)
      console.error(`could not connect to: ${relayUrl}, skipping.`, error)
      resolve(null) // signal unsuccessful attempt
    })

    relay.connect()
  })
}

run()