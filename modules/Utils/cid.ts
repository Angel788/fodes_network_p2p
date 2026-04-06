import { CID } from 'multiformats'
import * as json from 'multiformats/codecs/json'
import { sha256 } from 'multiformats/hashes/sha2'
export class CIDUtils {
    public async convertJsontoCID(data: any): Promise<string> {
        // 1. Forzar expansión de arreglos y limpieza de tipos (Dates a Strings)
        const deepClone = JSON.parse(JSON.stringify(data));

        // 2. Función de ordenamiento recursivo (Canonicalización)
        const sortObject = (obj: any): any => {
            if (obj === null || typeof obj !== 'object') return obj;
            if (Array.isArray(obj)) return obj.map(sortObject);
            return Object.keys(obj).sort().reduce((result: any, key) => {
                result[key] = sortObject(obj[key]);
                return result;
            }, {});
        };

        const canonicalData = sortObject(deepClone);

        // 3. Generar el CID (Asegúrate de importar json y sha256 de multiformats)
        const bytes = json.encode(canonicalData);
        const hash = await sha256.digest(bytes);
        const cid = CID.create(1, json.code, hash);

        return cid.toString();
    }
}