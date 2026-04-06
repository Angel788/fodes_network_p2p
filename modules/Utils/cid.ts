import { CID } from 'multiformats'
import * as json from 'multiformats/codecs/json'
import { sha256 } from 'multiformats/hashes/sha2'
export class CIDUtils {
    public async convertJsontoCID(data: any): Promise<CID> {
        const sortObject = (obj: any): any => {
            if (obj === null || typeof obj !== 'object') return obj;
            if (Array.isArray(obj)) return obj.map(sortObject);
            return Object.keys(obj).sort().reduce((result: any, key) => {
                result[key] = sortObject(obj[key]);
                return result;
            }, {});
        };

        try {
            // 1. Normalizar (convertir Dates a strings, etc.) y ordenar llaves
            const normalized = JSON.parse(JSON.stringify(data));
            const sortedData = sortObject(normalized);

            // 2. Codificar y Hashear
            const bytes = json.encode(sortedData);
            const hash = await sha256.digest(bytes);

            // 3. Crear CIDv1 con codec JSON (0x0200)
            return CID.create(1, json.code, hash);
        } catch (err) {
            throw new Error(`Error generando CID: ${err instanceof Error ? err.message : String(err)}`);
        }
    }
}