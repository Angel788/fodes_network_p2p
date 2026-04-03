import { Libp2p } from "@libp2p/interface";
import { multiaddr, Multiaddr } from "@multiformats/multiaddr";
import { ProtocolLibp2p } from "../Protocols/Libp2p/ProtocolLibp2p.js"
import { CID } from 'multiformats'
import { lpStream } from '@libp2p/utils'
import { KadDHT } from '@libp2p/kad-dht';
import { CIDUtils } from '../Utils/cid.js'
import { NodeDbManager } from "../Db/Node/index.js";
export class NodeLibp2p {
    public id!: string
    public node!: Libp2p;
    private direccionCommentProtocol: string;
    private protocolComents: ProtocolLibp2p;
    private direccionPublicationProtocol: string;
    private protocolPublication: ProtocolLibp2p;
    protected nodeDb: NodeDbManager;
    constructor() {
        this.direccionCommentProtocol = '/forum/comments/1.0.0';
        this.direccionPublicationProtocol = '/forum/posts/1.0.0';
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
    }
    public getDb(): NodeDbManager {
        return this.nodeDb;
    }
    public start() {
        this.node.start();
        this.protocolComents = new ProtocolLibp2p(this.node, this.direccionCommentProtocol, 'COMENTARIOS', this.getDb());
        this.protocolPublication = new ProtocolLibp2p(this.node, this.direccionPublicationProtocol, 'PUBLICACIONES', this.getDb());
        this.startProtocols();
        this.node.addEventListener('peer:discovery', async (evt) => {
            const peerId = evt.detail.id
            console.log('Veo a un nuevo nodo')
            try {
                await this.node.dial(peerId)
                console.log("Conectado el nuevo nodo")
            } catch (err) {
                console.log(err)
            }
        });
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
                        const idProvider = provider.id;
                        console.log(idProvider.toString())
                        console.log(this.id)
                        if (idProvider.toString() == this.id) {
                            const res = (await this.nodeDb.getContent(targetCID)).data;
                            console.log(res)
                            const cidReponse = await (await cidUtils.convertJsontoCID(res)).toString();
                            if (targetCID == cidReponse) {
                                console.log("Publicacion Encontrada");
                                return res;
                            }
                        }
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
            //Todo
        } catch (error) {

        }
    }
    public async imprimirEstadoDeLaRed() {
        console.log("\n==========================================");
        console.log("🔍 ESTADO DE MI DIRECTORIO P2P");
        console.log("==========================================");

        // 1. Ver todas las conexiones activas (El tubo físico está abierto)
        const conexiones = this.node.getConnections();
        console.log(`🟢 Conexiones activas actuales: ${conexiones.length}`);
        conexiones.forEach(conn => {
            console.log(`   -> Conectado a: ${conn.remotePeer.toString()}`);
        });

        console.log("------------------------------------------");

        // 2. Ver el Peer Store (El DHT: Todos los nodos de los que he oído hablar)
        const nodosConocidos = await this.node.peerStore.all();

        // Filtramos para no contarnos a nosotros mismos
        const vecinos = nodosConocidos.filter(peer => peer.id.toString() !== this.id);

        console.log(`📚 Nodos totales en mi directorio (K-Buckets): ${vecinos.length}`);

        vecinos.forEach(vecino => {
            console.log(`   🆔 ID: ${vecino.id.toString()}`);

            // Imprimir las direcciones públicas/privadas que conocemos de este vecino
            if (vecino.addresses.length > 0) {
                console.log(`      📍 Direcciones conocidas:`);
                vecino.addresses.forEach(addr => {
                    console.log(`         - ${addr.multiaddr.toString()}`);
                });
            } else {
                console.log(`      ⚠️ Sin direcciones (Solo sabemos que existe)`);
            }
        });
        console.log("==========================================\n");
    }
}