import { Libp2p } from "libp2p";
import { lpStream } from '@libp2p/utils'
import { NodeDbManager } from "../../Db/Node/index.js";
export class ProtocolLibp2p {
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
        this.node.handle(this.direction, (stream) => {
            Promise.resolve().then(async () => {
                try {
                    const lp = await lpStream(stream)
                    const req = await lp.read();
                    const query = JSON.parse(new TextDecoder().decode(req.subarray()))
                    const targetCID = query['cid'];
                    try {
                        const publication = this.dbManager.getContent(targetCID)
                        await lp.write(new TextEncoder().encode(JSON.stringify(publication)))
                    } catch (error) {
                        console.log("No se pudo hacer la consulta de la  " + this.type + " erro: ");
                    }
                } catch (err) {
                    console.log("Error cid puede estar corrupto " + this.type + " error: " + err);
                }

            })

        })
    }
}