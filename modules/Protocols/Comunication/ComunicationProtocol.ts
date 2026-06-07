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
        this.node.handle(this.direction, (stream) => {
            Promise.resolve().then(async () => {
                try {
                    const lp = lpStream(stream);
                    const req = await lp.read();
                    const query = JSON.parse(new TextDecoder().decode(req.subarray()));
                    const targetCID = query['cid'];

                    try {
                        const publication = await this.dbManager.getContent(targetCID);
                        const dataToSend = publication.data ? publication.data : publication;

                        const encodedData = new TextEncoder().encode(JSON.stringify(dataToSend));
                        await lp.write(encodedData);
                        // Aseguramos que los datos se envíen antes de cerrar
                        await stream.close();
                    } catch (error) {
                        console.log("No se pudo hacer la consulta de la " + this.type + " error: ", error);
                        stream.abort(error as Error);
                    }
                } catch (err) {
                    console.log("Error cid puede estar corrupto " + this.type + " error: " + err);
                    stream.abort(err as Error);
                }
            });
        });
    }
}