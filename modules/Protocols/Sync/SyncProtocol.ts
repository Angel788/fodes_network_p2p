import { Libp2p, PeerId } from '@libp2p/interface'
import { lpStream } from '@libp2p/utils'
import { NodeDbManager } from '../../Db/Node/index.js'

type VoteMsg         = { type: 'vote';         cid: string; userId: string; dir: number }
type MergeVotesMsg   = { type: 'mergeVotes';   cid: string; votes: Record<string, number> }
type CommentIndexMsg = { type: 'commentIndex'; parentCid: string; commentCid: string }
type ContentMsg      = { type: 'content';      cid: string; data: any }
type SyncMsg = VoteMsg | MergeVotesMsg | CommentIndexMsg | ContentMsg

export class SyncProtocol {
    private readonly PROTOCOL = '/forum/sync/1.0.0'
    private node: Libp2p
    private db: NodeDbManager
    private onMutableUpdate: ((cid: string, total: number, votesMap: Record<string, number>) => void) | null = null
    private onNewContentCallback: ((cid: string, data: any) => void) | null = null
    private onCommentIndexCallback: ((parentCid: string, commentCid: string) => void) | null = null
    private onVoteRelayCallback: ((msg: VoteMsg) => void) | null = null

    constructor(node: Libp2p, db: NodeDbManager) {
        this.node = node
        this.db   = db
    }

    public onUpdate(callback: (cid: string, total: number, votesMap: Record<string, number>) => void) {
        this.onMutableUpdate = callback
    }

    public onNewContent(callback: (cid: string, data: any) => void) {
        this.onNewContentCallback = callback
    }

    public onCommentIndex(callback: (parentCid: string, commentCid: string) => void) {
        this.onCommentIndexCallback = callback
    }

    public onVoteRelay(callback: (msg: VoteMsg) => void) {
        this.onVoteRelayCallback = callback
    }

    public init() {
        this.node.handle(this.PROTOCOL, async (stream) => {
            try {
                const lp  = lpStream(stream as any)
                const raw = await lp.read()
                const msg = JSON.parse(new TextDecoder().decode(raw.subarray())) as SyncMsg
                await this.applyMessage(msg)
            } catch {
                // ignore malformed / disconnected streams
            } finally {
                try { (stream as any).close?.() } catch {}
            }
        })
    }

    private async applyMessage(msg: SyncMsg) {
        if (msg.type === 'vote') {
            // Deduplicación: solo reenviar si el voto cambió.
            // dir=0 means "no vote" — treat missing key (undefined) as 0.
            const existing = await this.db.getVotes(msg.cid)
            const existingDir = existing[msg.userId] ?? 0
            const isNew = existingDir !== msg.dir
            await this.db.setVote(msg.cid, msg.userId, msg.dir)
            const total    = await this.db.getVoteTotal(msg.cid)
            const votesMap = await this.db.getVotes(msg.cid)
            if (this.onMutableUpdate) this.onMutableUpdate(msg.cid, total, votesMap)
            if (isNew && this.onVoteRelayCallback) this.onVoteRelayCallback(msg)

        } else if (msg.type === 'mergeVotes') {
            await this.db.mergeVotes(msg.cid, msg.votes)
            const total    = await this.db.getVoteTotal(msg.cid)
            const votesMap = await this.db.getVotes(msg.cid)
            if (this.onMutableUpdate) this.onMutableUpdate(msg.cid, total, votesMap)

        } else if (msg.type === 'commentIndex') {
            const existingIndex = await this.db.getCommentIndex(msg.parentCid)
            const isNew = !existingIndex.includes(msg.commentCid)
            await this.db.addCommentToIndex(msg.parentCid, msg.commentCid)
            if (isNew && this.onCommentIndexCallback) this.onCommentIndexCallback(msg.parentCid, msg.commentCid)

        } else if (msg.type === 'content') {
            const existing = await this.db.getContent(msg.cid)
            if (existing.error) {
                await this.db.saveContent(msg.cid, msg.data)
                if (this.onNewContentCallback && msg.cid.startsWith('bafyrei')) {
                    this.onNewContentCallback(msg.cid, msg.data)
                }
            }
        }
    }

    public async push(peerId: PeerId, message: SyncMsg): Promise<void> {
        let stream: any = null
        try {
            stream = await this.node.dialProtocol(peerId, this.PROTOCOL, {
                signal: AbortSignal.timeout(6000)
            })
            const lp = lpStream(stream as any)
            await lp.write(new TextEncoder().encode(JSON.stringify(message)))
        } catch {
            // peer unreachable — silent
        } finally {
            try { stream?.close() } catch {}
        }
    }

    // Push all local vote data to a newly-connected peer
    public async pushAllVotesToPeer(peerId: PeerId): Promise<void> {
        const entries = await this.db.getAllVoteEntries()
        for (const { cid, votes } of entries) {
            if (Object.keys(votes).length === 0) continue
            await this.push(peerId, { type: 'mergeVotes', cid, votes })
        }
    }

    // Push all comment index data to a newly-connected peer
    public async pushAllCommentIndexToPeer(peerId: PeerId): Promise<void> {
        const entries = await this.db.getAllCommentIndexEntries()
        for (const { parentCid, commentCids } of entries) {
            for (const commentCid of commentCids) {
                await this.push(peerId, { type: 'commentIndex', parentCid, commentCid })
            }
        }
    }

    // Push all stored content (posts + comments) to a newly-connected peer
    public async pushAllContentToPeer(peerId: PeerId): Promise<void> {
        try {
            for await (const [key, value] of this.db.getDb().iterator()) {
                if (!key.startsWith('bafyrei')) continue
                try {
                    // LevelDB with valueEncoding:'json' may return object or string
                    const data = (value && typeof value === 'object')
                        ? value as unknown as Record<string, unknown>
                        : JSON.parse(value as unknown as string)
                    await this.push(peerId, { type: 'content', cid: key, data })
                } catch {}
            }
        } catch {}
    }
}
