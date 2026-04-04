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
        // 1. CORRECCIÓN: Usar la desestructuración { stream }
        this.node.handle(this.direction, (stream) => {
            Promise.resolve().then(async () => {
                try {
                    // 2. CORRECCIÓN: Quitar el await de lpStream
                    const lp = lpStream(stream);
                    const req = await lp.read();
                    const query = JSON.parse(new TextDecoder().decode(req.subarray()));
                    const targetCID = query['cid'];

                    try {
                        // 3. CORRECCIÓN: Poner await en la base de datos local
                        const publication = await this.dbManager.getContent(targetCID);

                        // Verificamos si tu DB devuelve .data o el objeto directo
                        const dataToSend = publication.data ? publication.data : publication;

                        await lp.write(new TextEncoder().encode(JSON.stringify(dataToSend)));
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