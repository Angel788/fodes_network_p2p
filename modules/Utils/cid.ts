import { CID } from 'multiformats'
import * as json from 'multiformats/codecs/json'
import { sha256 } from 'multiformats/hashes/sha2'
export class CIDUtils {
    public async convertJsontoCID(data: JSON): Promise<CID> {
        try {
            const bytes = json.encode(data)
            const hash = await sha256.digest(bytes)
            const cid = CID.create(1, json.code, hash)
            return cid;
        } catch (err) {
            console.log("Error al hacer el parseo: ", err)
        }
    }
}