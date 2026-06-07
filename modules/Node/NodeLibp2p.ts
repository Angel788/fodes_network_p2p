import { Libp2p, PeerId } from "@libp2p/interface";
import { multiaddr, Multiaddr } from "@multiformats/multiaddr";
import { ComunicationProtocol } from "../Protocols/Comunication/ComunicationProtocol.js"
import { ReplicationProtocol } from "../Protocols/Replication/ReplicationProtocol.js"
import { AnnounceProtocol } from "../Protocols/Announce/AnnounceProtocol.js"
import { SyncProtocol } from "../Protocols/Sync/SyncProtocol.js"
import { CID } from 'multiformats'
import { lpStream } from '@libp2p/utils'
import { KadDHT } from '@libp2p/kad-dht';
import { CIDUtils } from '../Utils/cid.js'
import { NodeDbManager } from "../Db/Node/index.js";

export class NodeLibp2p {
    public id!: string
    public node!: Libp2p;
    private direccionCommentProtocol: string;
    private protocolComents: ComunicationProtocol;
    private direccionPublicationProtocol: string;
    private protocolPublication: ComunicationProtocol;
    protected nodeDb: NodeDbManager;
    private direccionReplicationProtocol: string;
    private protocolReplication: ReplicationProtocol;
    private announceProtocol: AnnounceProtocol;
    private syncProtocol: SyncProtocol;
    private onNewCIDCallback: ((cid: string) => void) | null = null;
    private onVoteUpdateCallback: ((cid: string, total: number, votesMap: Record<string, number>) => void) | null = null;
    private onCommentIndexCallback: ((parentCid: string, commentCid: string) => void) | null = null;

    constructor() {
        this.direccionCommentProtocol = '/forum/comments/1.0.0';
        this.direccionPublicationProtocol = '/forum/posts/1.0.0';
        this.direccionReplicationProtocol = '/forum/replication/1.0.0';
        this.nodeDb = new NodeDbManager()
    }

    public onNewCID(callback: (cid: string) => void) {
        this.onNewCIDCallback = callback
    }

    public onVoteUpdate(callback: (cid: string, total: number, votesMap: Record<string, number>) => void) {
        this.onVoteUpdateCallback = callback
    }

    public onCommentIndex(callback: (parentCid: string, commentCid: string) => void) {
        this.onCommentIndexCallback = callback
    }

    public getMultiaddrs(): Multiaddr[] {
        return this.node.getMultiaddrs();
    }
    public getDirections(): string[] {
        return this.node.getMultiaddrs().map((ma) => ma.toString());
    }
    public startProtocols() {
        this.protocolComents.initProcol();
        this.protocolPublication.initProcol();
        this.protocolReplication.initProcol();
        this.announceProtocol.init();
        this.syncProtocol.init();
    }
    public getDb(): NodeDbManager {
        return this.nodeDb;
    }
    public async start() {
        await this.node.start();

        this.protocolComents = new ComunicationProtocol(this.node, this.direccionCommentProtocol, 'COMENTARIOS', this.getDb());
        this.protocolPublication = new ComunicationProtocol(this.node, this.direccionPublicationProtocol, 'PUBLICACIONES', this.getDb());
        this.protocolReplication = new ReplicationProtocol(this, this.direccionReplicationProtocol, 'REPLICATION', this.getDb());
        this.announceProtocol = new AnnounceProtocol(this.node, (cid) => {
            if (this.onNewCIDCallback) this.onNewCIDCallback(cid)
        });
        this.syncProtocol = new SyncProtocol(this.node, this.nodeDb)
        this.syncProtocol.onUpdate((cid, total, votesMap) => {
            if (this.onVoteUpdateCallback) this.onVoteUpdateCallback(cid, total, votesMap)
        })
        this.syncProtocol.onNewContent((cid, data) => {
            if (this.onNewCIDCallback) this.onNewCIDCallback(cid)
            // Relay: re-broadcast to all connected peers so bootstrap and
            // other nodes forward content without needing direct connections
            this.broadcastToPeers({ type: 'content', cid, data }).catch(() => { })
        })
        this.syncProtocol.onCommentIndex((parentCid, commentCid) => {
            if (this.onCommentIndexCallback) this.onCommentIndexCallback(parentCid, commentCid)
        })
        this.syncProtocol.onVoteRelay((msg) => {
            this.broadcastToPeers(msg).catch(() => { })
        })

        this.startProtocols();

        // When a new peer connects, push all our mutable state to them
        this.node.addEventListener('peer:connect', (evt) => {
            const peerId = evt.detail as PeerId
            // Randomized delay to avoid synchronized bursts when many nodes connect at once
            const delay = 2000 + Math.random() * 5000
            setTimeout(() => this.pushStateToPeer(peerId), delay)
        })

        /*this.node.addEventListener('self:peer:update', (evt) => {
            console.log('[Libp2p] Mis direcciones han cambiado:', this.getDirections())
        })*/

        // Periodic fallback sync every 30-60s — ensures eventual consistency
        // even when real-time push failed (e.g. stream limit, transient disconnect)
        setInterval(async () => {
            for (const peerId of this.node.getPeers()) {
                try {
                    // Only sync metadata periodically, content is too heavy for frequent pushes
                    await this.syncProtocol.pushAllVotesToPeer(peerId)
                    await this.syncProtocol.pushAllCommentIndexToPeer(peerId)
                } catch { }
            }
        }, 30_000 + Math.random() * 30_000)
    }

    // ── Vote ──────────────────────────────────────────────────────
    public async vote(cid: string, userId: string, dir: number): Promise<number> {
        await this.nodeDb.setVote(cid, userId, dir)
        const total = await this.nodeDb.getVoteTotal(cid)
        this.broadcastToPeers({ type: 'vote', cid, userId, dir }).catch(() => { })
        return total
    }

    // Push local metadata (votes + comment indexes) to a peer. 
    // Content is skipped to avoid saturating the network; it's fetched on demand.
    private async pushStateToPeer(peerId: PeerId): Promise<void> {
        try {
            // We no longer push all content automatically to prevent bootstrap collapse
            // await this.syncProtocol.pushAllContentToPeer(peerId) 
            await this.syncProtocol.pushAllVotesToPeer(peerId)
            await this.syncProtocol.pushAllCommentIndexToPeer(peerId)
        } catch {
            // peer may have disconnected
        }
    }

    // Fetch content: local DB first, then network
    private async fetchContent(cid: string, protocol: string): Promise<any | null> {
        const local = await this.nodeDb.getContent(cid)
        if (!local.error && local.data) return local.data
        const remote = await this.getContent(cid, protocol)
        if (remote) {
            // Cache locally so future reads are instant
            await this.nodeDb.saveContent(cid, remote as unknown as JSON)
        }
        return remote ?? null
    }

    public async createContent(data: JSON): Promise<string | null> {
        if (!this.node) { return null; }
        try {
            const cidUtils = new CIDUtils();
            const cid = await cidUtils.convertJsontoCID(data);
            await this.saveContent(cid, data);
            this.announceProtocol.broadcast(cid).catch(() => { })
            this.broadcastToPeers({ type: 'content', cid, data }).catch(() => { })
            return cid;
        } catch (error) {
            console.log("Error al crear contenido: ", error);
            return null;
        }
    }

    public async getAllLocalCIDs(): Promise<string[]> {
        const cids: string[] = [];
        try {
            const iterator = this.nodeDb.getDb().iterator();
            for await (const [key] of iterator) {
                if (key.startsWith("bafyrei")) {
                    cids.push(key);
                }
            }
        } catch (error) {
            console.log("Error al obtener CIDs locales: ", error);
        }
        return cids;
    }

    public async saveContent(cid: string, data: JSON) {
        if (!this.node) { return; }
        try {
            const responseSaveContentNode = this.nodeDb.saveContent(cid, data);
            if ((await responseSaveContentNode).error) {
                console.log("Lo sentimos hubo un error: ", (await responseSaveContentNode).message);
            } else {
                this.provideContent(cid);
                console.log("Se guardo el contenido y se propago en la red");
            }
        } catch (error) {
            console.log("Lo sentimos hubo un error: ", error);
        }
    }

    private async provideContent(targetCID: string) {
        if (!this.node) { return; }
        try {
            const cid = CID.parse(targetCID);
            try {
                const kad = this.node.services.dht as KadDHT
                for await (const _event of kad.provide(cid)) { /* noop */ }
            } catch (err) {
                console.log("Error al anunciar el CID: ", err)
            }
        }
        catch (err) {
            console.log("Error al traducir el CID: ", err);
        }
    }

    public async getContent(targetCID: string, protocol: string): Promise<JSON> {
        if (!this.node) { return null; }

        // 1. Local LevelDB — más rápido y confiable
        const localRes = await this.nodeDb.getContent(targetCID)
        if (!localRes.error && localRes.data) {
            return localRes.data as unknown as JSON
        }

        // 2. Peers conectados directamente — más confiable que DHT para redes pequeñas
        const cidUtils = new CIDUtils()
        for (const peerId of this.node.getPeers()) {
            if (peerId.toString() === this.id) continue
            try {
                const stream = await this.node.dialProtocol(peerId, protocol, {
                    signal: AbortSignal.timeout(3000)
                })
                const lp = lpStream(stream)
                await lp.write(new TextEncoder().encode(JSON.stringify({ 'cid': targetCID })))
                const res = await lp.read()
                const output = new TextDecoder().decode(res.subarray())
                const parsed = JSON.parse(output)
                const cidResponse = (await cidUtils.convertJsontoCID(parsed)).toString()
                await stream.close()
                if (cidResponse === targetCID) {
                    await this.nodeDb.saveContent(targetCID, parsed as unknown as JSON)
                    return parsed
                }
            } catch {
                // este peer no tiene el contenido — continuar
            }
        }

        // 3. DHT como último recurso (puede tener registros stale)
        try {
            const cid = await CID.parse(targetCID);
            for await (const provider of this.node.contentRouting.findProviders(cid)) {
                const idProvider = provider.id;
                if (idProvider.toString() === this.id) continue
                // Saltar si ya lo intentamos como peer conectado
                if (this.node.getPeers().some(p => p.toString() === idProvider.toString())) continue
                try {
                    const stream = await this.node.dialProtocol(idProvider, protocol, {
                        signal: AbortSignal.timeout(3000)
                    });
                    const lp = lpStream(stream);
                    await lp.write(new TextEncoder().encode(JSON.stringify({ 'cid': targetCID })))
                    const res = await lp.read()
                    const output = new TextDecoder().decode(res.subarray());
                    const parsed = JSON.parse(output)
                    const cidResponse = (await cidUtils.convertJsontoCID(parsed)).toString();
                    await stream.close()
                    if (cidResponse === targetCID) {
                        await this.nodeDb.saveContent(targetCID, parsed as unknown as JSON)
                        return parsed;
                    }
                } catch {
                    // provider stale o inalcanzable — libp2p lo descarta automáticamente
                }
            }
        } catch {
            // DHT no disponible o sin providers
        }

        return null;
    }

    public async contact(libp2Direction: string) {
        try {
            await this.node.dial(multiaddr(libp2Direction));
            console.log("Conexión exitosa");
        } catch (error) {
            console.log("Error al conectar: " + error);
        }
    }

    public async replicate(cidContent: string, data: JSON) {
        try {
            const idBytes = this.node.peerId.toMultihash().bytes
            for await (const nodeCloser of this.node.peerRouting.getClosestPeers(idBytes)) {
                try {
                    const idCloserNode = nodeCloser.id
                    const stream = await this.node.dialProtocol(idCloserNode, this.direccionReplicationProtocol, {
                        signal: AbortSignal.timeout(3000)
                    });
                    const lp = lpStream(stream);
                    lp.write(new TextEncoder().encode(JSON.stringify({ 'cid': cidContent, "data": data })))
                    await lp.read()
                } catch (error) {
                    console.log("Error al contactar al vecino más cercano: " + error);
                }
            }
        } catch (error) {
            console.log("Error al replicar: " + error);
        }
    }

    public async createComment(publicationCid: string, data: JSON): Promise<string | null> {
        if (!this.node) { return null; }
        try {
            const cidUtils = new CIDUtils();
            const cid = await cidUtils.convertJsontoCID(data);
            await this.nodeDb.saveContent(cid, data);
            await this.nodeDb.addCommentToIndex(publicationCid, cid);
            this.provideContent(cid).catch(() => { });

            // Push a peers conectados ahora + k-nearest del DHT (en background)
            this.broadcastComment(publicationCid, cid, data).catch(() => { })

            return cid;
        } catch (error) {
            console.log("Error al crear comentario: ", error);
            return null;
        }
    }

    // Envía uno o más mensajes sync a peers conectados + k-nearest del DHT
    private async broadcastToPeers(...messages: object[]): Promise<void> {
        const seen = new Set<string>()

        const pushToPeer = (peerId: PeerId) => {
            const key = peerId.toString()
            if (seen.has(key)) return
            seen.add(key)
            for (const msg of messages) {
                this.syncProtocol.push(peerId, msg as any).catch(() => { })
            }
        }

        for (const peerId of this.node.getPeers()) pushToPeer(peerId)

        try {
            const idBytes = this.node.peerId.toMultihash().bytes
            for await (const peer of this.node.peerRouting.getClosestPeers(idBytes)) {
                pushToPeer(peer.id)
            }
        } catch { /* DHT puede fallar si la red es pequeña */ }
    }

    private async broadcastComment(publicationCid: string, commentCid: string, data: JSON): Promise<void> {
        await this.broadcastToPeers(
            { type: 'content', cid: commentCid, data },
            { type: 'commentIndex', parentCid: publicationCid, commentCid }
        )
    }

    public async getPublicationComments(publicationCid: string): Promise<any[]> {
        const comments: any[] = []
        await this.streamPublicationComments(publicationCid, (comment) => comments.push(comment))
        return comments
    }

    public async streamPublicationComments(
        publicationCid: string,
        onComment: (comment: any) => void
    ): Promise<void> {
        const commentCids = await this.nodeDb.getCommentIndex(publicationCid)
        for (const cid of commentCids) {
            const data = await this.fetchContent(cid, '/forum/comments/1.0.0')
            if (!data) continue
            const votos = await this.nodeDb.getVoteTotal(cid)
            const votesMap = await this.nodeDb.getVotes(cid)
            const comment: any = { ...data, cid, votos, votesMap }
            const subCids = await this.nodeDb.getCommentIndex(cid)
            const respuestas: any[] = []
            for (const subCid of subCids) {
                const subData = await this.fetchContent(subCid, '/forum/comments/1.0.0')
                if (subData) {
                    const subVotos = await this.nodeDb.getVoteTotal(subCid)
                    const subVotesMap = await this.nodeDb.getVotes(subCid)
                    respuestas.push({ ...subData, cid: subCid, votos: subVotos, votesMap: subVotesMap })
                }
            }
            comment.respuestas = respuestas
            onComment(comment)
        }
    }

    public async provideCurrentContentSavedInDb() {
        try {
            const dbIterator = this.nodeDb.getDb().iterator()
            for await (const [key] of dbIterator) {
                if (key.startsWith("bafyrei")) {
                    // sequential provide to avoid overwhelming the DHT stack
                    await this.provideContent(key);
                    // Very small delay to yield the event loop
                    await new Promise(r => setTimeout(r, 100))
                }
            }
        } catch (error) {
            console.log("Error al anunciar el contenido actual en la base de datos: " + error);
        }
    }
}
