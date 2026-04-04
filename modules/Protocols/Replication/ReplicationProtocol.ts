import { Libp2p } from "libp2p";
import { lpStream } from '@libp2p/utils'
import { NodeDbManager } from "../../Db/Node/index.js";
import { NodeLibp2p } from "../../Node/NodeLibp2p.js"
export class ReplicationProtocol {
    private node: NodeLibp2p;
    private direction: string;
    private type: string;
    private dbManager: NodeDbManager
    constructor(node: NodeLibp2p, direction: string, type: string, dbManger: NodeDbManager) {
        this.node = node;
        this.direction = direction;
        this.type = type;
        this.dbManager = dbManger;
    }
    public initProcol() {
        this.node.node.handle(this.direction, (stream) => {
            Promise.resolve().then(async () => {
                try {
                    const lp = lpStream(stream);
                    const req = await lp.read();
                    const query = JSON.parse(new TextDecoder().decode(req.subarray()));
                    const targetCID = query['cid'];
                    const data = query['data'];
                    try {
                        this.node.saveContent(targetCID, data);
                        await lp.write(new TextEncoder().encode(JSON.stringify({
                            "succes": true
                        })));
                    } catch (error) {
                        console.log("No se pudo hacer la consulta de la " + this.type + " error: ", error);
                    }
                } catch (err) {
                    console.log("Error cid puede estar corrupto " + this.type + " error: " + err);
                }
            });
        });
    }
}