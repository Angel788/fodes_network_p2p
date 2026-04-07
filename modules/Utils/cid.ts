import { CID } from 'multiformats'
import * as json from 'multiformats/codecs/json'
import { sha256 } from 'multiformats/hashes/sha2'
import * as dagCbor from '@ipld/dag-cbor'
export class CIDUtils {
    public async convertJsontoCID(data: any): Promise<string> {
        try {
            const bytes = dagCbor.encode(data)
            const hash = await sha256.digest(bytes);
            const cid = CID.create(1, dagCbor.code, hash);
            return cid.toString();
        } catch (error) {
            console.log("Error al convertir CID: " + error)
            throw error;
        }
    }
}