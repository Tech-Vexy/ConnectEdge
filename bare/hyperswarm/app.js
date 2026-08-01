const Hyperswarm = require('hyperswarm')
const b4a = require('b4a')

const { IPC } = BareKit

let swarm = null
let isStopped = false
let rx = ''

IPC.on('data', (data) => {
  rx += data.toString()
  let idx = rx.indexOf('\n')
  while (idx !== -1) {
    const line = rx.slice(0, idx)
    rx = rx.slice(idx + 1)
    if (line.length > 0) handleMessage(line)
    idx = rx.indexOf('\n')
  }
})

function send(type, payload) {
  IPC.write(Buffer.from(JSON.stringify({ type, payload }) + '\n'))
}

function handleMessage(line) {
  let msg
  try { msg = JSON.parse(line) } catch { return }

  switch (msg.type) {
    case 'start':
      handleStart(msg.payload)
      break
    case 'stop':
      handleStop()
      break
    case 'updateLocation':
      handleUpdateLocation(msg.payload)
      break
  }
}

async function handleStart({ gridCell, peerId }) {
  if (swarm) return

  isStopped = false
  swarm = new Hyperswarm({
    maxConnections: 64,
    firewall: () => false,
  })

  swarm.on('error', (err) => {
    send('error', { message: err.message })
  })

  swarm.on('connection', (connection, peerInfo) => {
    if (isStopped) return

    const remotePubKey = b4a.toString(peerInfo.publicKey, 'hex')

    send('peer:discovered', {
      hyperswarmKey: remotePubKey,
      topic: gridCell,
      ts: Date.now(),
    })

    connection.write(JSON.stringify({ type: 'hello', peerIdHash: hashPeerId(peerId) }))

    connection.on('data', (data) => {
      try {
        const msg = JSON.parse(data.toString())
        if (msg.type === 'hello') {
          send('peer:hello', {
            hyperswarmKey: remotePubKey,
            peerIdHash: msg.peerIdHash,
            ts: Date.now(),
          })
        }
      } catch {}
    })

    connection.on('close', () => {
      send('peer:left', { hyperswarmKey: remotePubKey })
    })

    connection.on('error', () => {})
  })

  const topic = deriveSwarmTopic(gridCell)
  const discovery = swarm.join(topic, { server: true, client: true })
  await discovery.flushed()

  send('ready', { gridCell, peersInTopic: swarm.connections.size })
}

async function handleStop() {
  isStopped = true
  if (swarm) {
    await swarm.destroy()
    swarm = null
  }
  send('stopped')
}

async function handleUpdateLocation({ gridCell, peerId }) {
  if (!swarm) {
    handleStart({ gridCell, peerId })
    return
  }

  for (const [topic] of swarm.topics) {
    swarm.leave(topic)
  }

  const topic = deriveSwarmTopic(gridCell)
  const discovery = swarm.join(topic, { server: true, client: true })
  await discovery.flushed()

  send('locationUpdated', { gridCell })
}

function deriveSwarmTopic(gridCell) {
  const crypto = require('crypto')
  const input = `connectedge:campus:${gridCell}`
  return crypto.createHash('sha256').update(input).digest()
}

function hashPeerId(peerId) {
  const crypto = require('crypto')
  return crypto.createHash('sha256').update(peerId).digest('hex').slice(0, 16)
}

send('worklet:loaded')

