import { Libp2p } from "libp2p";
import { lpStream } from '@libp2p/utils'
import { NodeDbManager } from "../../Db/Node/index.js";
export class ComunicationProtocol {
    private node: Libp2p;
    private direction: string;
    private type: string;
    private dbManager: NodeDbManager
    constructor(node: Libp2p, direction: string, type: string, dbManger: NodeDbManager) {
        this.node = node;
        this.direction = direction;
        this.type = type;
        this.dbManager = dbManger;
    }
    public initProcol() {
        this.node.handle(this.direction, async (stream) => {
            try {
                const lp = lpStream(stream);
                const req = await lp.read();
                const query = JSON.parse(new TextDecoder().decode(req.subarray()));
                const targetCID = query['cid'];
                const publication = await this.dbManager.getContent(targetCID);
                const dataToSend = publication.data ? publication.data : publication;
                await lp.write(new TextEncoder().encode(JSON.stringify(dataToSend)));
            } catch {
                // stream reset, CID no encontrado, o peer desconectado — ignorar
            } finally {
                (stream as any).close?.()?.catch?.(() => {})
            }
        });
    }
}
