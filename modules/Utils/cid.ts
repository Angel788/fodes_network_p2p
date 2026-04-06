import { CID } from 'multiformats'
import * as json from 'multiformats/codecs/json'
import { sha256 } from 'multiformats/hashes/sha2'

export class CIDUtils {
    public async convertJsontoCID(data: any): Promise<CID> {
        try {
            // 1. Ordenar las llaves del objeto para asegurar determinismo
            const sortedData = this.sortObject(data);

            // 2. Codificar a bytes
            const bytes = json.encode(sortedData);

            // 3. Generar Hash y CID
            const hash = await sha256.digest(bytes);
            const cid = CID.create(1, json.code, hash);

            return cid;
        } catch (err) {
            console.error("Error al generar CID: ", err);
            throw err;
        }
    }

    // Función auxiliar para asegurar que el JSON siempre tenga el mismo orden
    private sortObject(obj: any): any {
        if (obj === null || typeof obj !== 'object') return obj;
        if (Array.isArray(obj)) return obj.map(this.sortObject.bind(this));

        return Object.keys(obj).sort().reduce((result: any, key) => {
            result[key] = this.sortObject(obj[key]);
            return result;
        }, {});
    }
}