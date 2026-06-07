
import { NormalNode } from "./modules/Node/NormalNode.js"
//import axios from 'axios';
import { NodeGateway } from "./NormalNodeModules/NodeGateway.js";
import { readFileSync } from 'node:fs';

const main = async () => {
    try {
        const psk = readFileSync('./swarm.key');
        const dir = process.env.BOOTSTRAP_NODE ?? '/ip4/35.254.223.142/tcp/1080/p2p/12D3KooWCxwYZz8a3RDH79VRoawfvfknRPRvpscdRbcBmvZXTg4h';
        const node = await NormalNode.create('', psk, dir);
        const nodeGateway = new NodeGateway(node)
        console.log(node.getDirections());
        await node.contact(dir);
        await node.provideCurrentContentSavedInDb();
        process.stdout.write('GATEWAY_READY\n');

        const shutdown = async () => {
            console.log('[Gateway] Cerrando base de datos...');
            await node.getDb().close();
            process.exit(0);
        };

        process.on('SIGTERM', shutdown);
        process.on('SIGINT', shutdown);

        // Reconectar al bootstrap cada 5 min — mantiene viva la reserva del relay
        // y garantiza que el nodo siga en la DHT aunque la conexión TCP se haya caído
        setInterval(async () => {
            await node.contact(dir);
        }, 5 * 60 * 1000);

        // Re-anunciar contenido en la DHT cada 12 h
        // Los registros de provider expiran a las 24 h; re-anunciamos a la mitad
        setInterval(async () => {
            await node.provideCurrentContentSavedInDb();
        }, 12 * 60 * 60 * 1000);
    } catch (error) {
        console.log(error)
    }
}

main()