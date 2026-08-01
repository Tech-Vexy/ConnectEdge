// Phase 0 spike — can libp2p even construct inside Bare?
// Packed with bare-pack, run in a worklet. Not shipped.
import { createLibp2p } from 'libp2p'
import { noise } from '@chainsafe/libp2p-noise'
import { yamux } from '@chainsafe/libp2p-yamux'
import { webSockets } from '@libp2p/websockets'
import { identify } from '@libp2p/identify'
import { gossipsub } from '@chainsafe/libp2p-gossipsub'

async function main() {
  const node = await createLibp2p({
    transports: [webSockets()],
    connectionEncryption: [noise()],
    streamMuxers: [yamux()],
    services: { identify: identify(), pubsub: gossipsub() },
  })
  await node.start()
  console.log('[spike] libp2p peerId=' + node.peerId.toString())
  await node.stop()
  console.log('[spike] libp2p stop OK')
}

main().catch((e) => {
  console.log('[spike] libp2p FAILED: ' + (e && e.stack ? e.stack : e))
})
