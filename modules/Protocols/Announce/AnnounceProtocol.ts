import { Libp2p, PeerId } from '@libp2p/interface'
import { lpStream } from '@libp2p/utils'

const ANNOUNCE_PROTOCOL = '/fodes/announce/1.0.0'

export class AnnounceProtocol {
    private node: Libp2p

    constructor(node: Libp2p) {
        this.node = node
    }

    public init() {
        this.node.handle(ANNOUNCE_PROTOCOL, (stream) => {
            Promise.resolve().then(async () => {
                try {
                    const lp  = lpStream(stream)
                    const msg = await lp.read()
                    const cid = new TextDecoder().decode(msg.subarray()).trim()

                    if (cid.startsWith('bafyrei')) {
                        console.log(`[Bootstrap][Announce] CID recibido: ${cid} — reenviando a ${this.node.getPeers().length} peers`)
                        // Reenviar a todos los peers conectados
                        for (const peerId of this.node.getPeers()) {
                            this.send(peerId, cid).catch(() => {})
                        }
                    }
                } catch {}
            })
        })
    }

    public async send(peerId: PeerId, cid: string): Promise<void> {
        let stream: any = null
        try {
            stream = await this.node.dialProtocol(peerId, ANNOUNCE_PROTOCOL, {
                signal: AbortSignal.timeout(5000)
            })
            const lp = lpStream(stream)
            await lp.write(new TextEncoder().encode(cid))
            await stream.close()
        } catch {
            // peer no soporta el protocolo o está inalcanzable
        }
    }
}
