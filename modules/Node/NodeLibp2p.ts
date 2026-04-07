import { Libp2p } from "@libp2p/interface";
import { multiaddr, Multiaddr } from "@multiformats/multiaddr";
import { ComunicationProtocol } from "../Protocols/Comunication/ComunicationProtocol.js"
import { ReplicationProtocol } from "../Protocols/Replication/ReplicationProtocol.js"
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
    constructor() {
        this.direccionCommentProtocol = '/forum/comments/1.0.0';
        this.direccionPublicationProtocol = '/forum/posts/1.0.0';
        this.direccionReplicationProtocol = '/forum/replication/1.0.0';
        this.nodeDb = new NodeDbManager()
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
    }
    public getDb(): NodeDbManager {
        return this.nodeDb;
    }
    public async start() {
        await this.node.start();
        this.protocolComents = new ComunicationProtocol(this.node, this.direccionCommentProtocol, 'COMENTARIOS', this.getDb());
        this.protocolPublication = new ComunicationProtocol(this.node, this.direccionPublicationProtocol, 'PUBLICACIONES', this.getDb());
        this.protocolReplication = new ReplicationProtocol(this, this.direccionReplicationProtocol, 'REPLICATION', this.getDb());
        this.startProtocols();
    }
    public async saveContent(cid: string, data: JSON) {
        if (!this.node) { return; }
        try {
            const responseSaveContentNode = this.nodeDb.seaveContent(cid, data);
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
                for await (const event of kad.provide(cid)) {
                    //console.log(event);
                }
            } catch (err) {
                console.log("Lo semntimos hubo un error al aunicar el CID: ", err)
            }
        }
        catch (err) {
            console.log("Lo sentimos hubo un error al traducir el CID: ", err);
        }
    }
    public async getContent(targetCID: string, protocol: string): Promise<JSON> {
        if (!this.node) { return; }
        try {
            const cid = CID.parse(targetCID);
            try {
                for await (const provider of this.node.contentRouting.findProviders(cid)) {
                    try {
                        const cidUtils = new CIDUtils();
                        const idProvider = await provider.id;
                        //console.log(idProvider.toString())
                        //console.log(this.id)
                        console.log(protocol, idProvider)
                        if (idProvider.toString() == this.id) {
                            const res = (await this.nodeDb.getContent(targetCID)).data;
                            console.log(res)
                            const cidReponse = await (await cidUtils.convertJsontoCID(res)).toString();
                            console.log(targetCID, cidReponse)
                            if (targetCID == cidReponse) {
                                console.log("Publicacion Encontrada");
                                return res;
                            }
                        } else {
                            const stream = await this.node.dialProtocol(idProvider, protocol);
                            const lp = lpStream(stream);
                            lp.write(new TextEncoder().encode(JSON.stringify({
                                'cid': targetCID
                            })))
                            const res = await lp.read()
                            const output = new TextDecoder().decode(res.subarray());
                            const cidReponse = await (await cidUtils.convertJsontoCID(JSON.parse(output))).toString();
                            if (cidReponse == targetCID) {
                                console.log("Publicacion Encontrada");
                                return JSON.parse(output);
                            }
                        }
                    }
                    catch (err) {
                        console.log("Hubo un error en la constulta: ", err);
                    }
                }

            } catch (err) {
                console.log("No se encontro ningun provider con el CID: " + err)
            }
        } catch (err) {
            console.log("Hubo un erro al hacer la consulta del CID " + err)
        }
        return JSON.parse("");
    }
    public async contact(libp2Direction: string) {
        try {
            await this.node.dial(multiaddr(libp2Direction));
            console.error("Succesfully conection");
        } catch (error) {
            console.log("Error in: " + error);
        }
    }
    public async replicate(cidContent: string, data: JSON) {
        try {
            const idBytes = this.node.peerId.toMultihash().bytes
            for await (const nodeCloser of this.node.peerRouting.getClosestPeers(idBytes)) {
                try {
                    const idCloserNode = nodeCloser.id
                    const stream = await this.node.dialProtocol(idCloserNode, this.direccionReplicationProtocol);
                    const lp = lpStream(stream);
                    lp.write(new TextEncoder().encode(JSON.stringify({
                        'cid': cidContent,
                        "data": data
                    })))
                    const res = await lp.read()
                    const output = new TextDecoder().decode(res.subarray());
                } catch (error) {
                    console.log("Hubo un error al contactar al vecino mas cercano: " + error);
                }
            }
        } catch (error) {
            console.log("Hubo un error al replicar: " + error);
        }
    }
    public async provideCurrentContentSavedInDb() {
        try {
            const dbIterator = this.nodeDb.getDb().iterator()
            for await (const [key, value] of dbIterator) {
                if (key.startsWith("bafyrei")) {
                    this.provideContent(key);
                    console.log(key);
                }
            }
        } catch (error) {
            console.log("Hubo un error al anuciar el contenido en  actual en la base de datos: " + error);
        }
    }
}