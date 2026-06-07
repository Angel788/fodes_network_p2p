import { Libp2p } from 'libp2p'
import { lpStream } from '@libp2p/utils'

const ANNOUNCE_PROTOCOL = '/fodes/announce/1.0.0'

export class AnnounceProtocol {
    private node: Libp2p
    private onNewCID: (cid: string) => void

    constructor(node: Libp2p, onNewCID: (cid: string) => void) {
        this.node = node
        this.onNewCID = onNewCID
    }

    // Escuchar anuncios entrantes de otros nodos
    public init() {
        this.node.handle(ANNOUNCE_PROTOCOL, (stream) => {
            Promise.resolve().then(async () => {
                try {
                    const lp = lpStream(stream as any)
                    const msg = await lp.read()
                    const cid = new TextDecoder().decode(msg.subarray()).trim()
                    if (cid.startsWith('bafyrei')) {
                        console.log(`[Announce] CID recibido de otro nodo: ${cid}`)
                        this.onNewCID(cid)
                    }
                } catch (err) {
                    console.log('[Announce] Error al leer anuncio:', err)
                }
            })
        })
    }

    // Anunciar un CID a todos los peers conectados
    public async broadcast(cid: string) {
        const peers = this.node.getPeers()
        console.log(`[Announce] Anunciando CID ${cid} a ${peers.length} peers`)

        for (const peerId of peers) {
            try {
                const stream = await this.node.dialProtocol(peerId, ANNOUNCE_PROTOCOL, {
                    signal: AbortSignal.timeout(5000)
                })
                const lp = lpStream(stream)
                await lp.write(new TextEncoder().encode(cid))
                await stream.close()
            } catch (err: any) {
                if (!String(err).includes('UnsupportedProtocolError')) {
                    console.log(`[Announce] No se pudo anunciar a ${peerId.toString()}: ${err}`)
                }
            }
        }
    }
}
