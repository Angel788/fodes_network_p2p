import { Libp2p, PeerId } from '@libp2p/interface'
import { lpStream } from '@libp2p/utils'
import { NodeDbManager } from '../../Db/Node/index.js'

type SyncMsg = { type: string; cid?: string; data?: any; [key: string]: any }

export class SyncProtocol {
    private readonly PROTOCOL = '/forum/sync/1.0.0'
    private node: Libp2p
    private db: NodeDbManager

    constructor(node: Libp2p, db: NodeDbManager) {
        this.node = node
        this.db   = db
    }

    public init() {
        this.node.handle(this.PROTOCOL, async (stream) => {
            try {
                const lp  = lpStream(stream)
                const raw = await lp.read()
                const msg = JSON.parse(new TextDecoder().decode(raw.subarray())) as SyncMsg

                if (msg.type === 'content' && msg.cid?.startsWith('bafyrei')) {
                    const existing = await this.db.getContent(msg.cid)
                    if (existing.error) {
                        await this.db.saveContent(msg.cid, msg.data)
                        console.log(`[Bootstrap][Sync] Contenido almacenado: ${msg.cid}`)
                    }
                }

                for (const peerId of this.node.getPeers()) {
                    this.push(peerId, msg).catch(() => {})
                }
            } catch {
                // stream malformado o peer desconectado
            } finally {
                ;(stream as any).close?.()?.catch?.(() => {})
            }
        })
    }

    public async push(peerId: PeerId, message: SyncMsg): Promise<void> {
        let stream: any = null
        try {
            stream = await this.node.dialProtocol(peerId, this.PROTOCOL, {
                signal: AbortSignal.timeout(6000)
            })
            const lp = lpStream(stream)
            await lp.write(new TextEncoder().encode(JSON.stringify(message)))
        } catch {
            // peer inalcanzable — silencioso
        } finally {
            ;(stream as any)?.close?.()?.catch?.(() => {})
        }
    }

    // Envía todo el contenido almacenado en el bootstrap a un peer recién conectado
    public async pushAllContentToPeer(peerId: PeerId): Promise<void> {
        try {
            for await (const [key, value] of this.db.getDb().iterator()) {
                if (!key.startsWith('bafyrei')) continue
                try {
                    const data = (value && typeof value === 'object')
                        ? value as unknown as Record<string, unknown>
                        : JSON.parse(value as unknown as string)
                    await this.push(peerId, { type: 'content', cid: key, data })
                } catch {}
            }
        } catch {}
    }
}
