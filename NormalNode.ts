
import { NormalNode } from "./modules/Node/NormalNode.js"
//import axios from 'axios';
import { NodeGateway } from "./NormalNodeModules/NodeGateway.js";
import { getLocalIPv6 } from "./NormalNodeModules/ip.js"
import { readFileSync } from 'node:fs';
interface DireccionLibp2p {
    BoostrapNode: string
}


const main = async () => {
    try {
        const psk = readFileSync('./swarm.key');
        const ip6 = await getLocalIPv6()
        const dir = '/ip4/34.70.68.193/tcp/1090/p2p/12D3KooWP6tccTrkSGbUCVcTPJgdShj9m8D67847LBYcaSQHr6Tz';
        const node = await NormalNode.create(ip6, psk);
        const nodeGateway = new NodeGateway(node)
        console.log(node.getDirections());
        await node.contact(dir);
        await node.provideCurrentContentSavedInDb();
        setInterval(async () => {
            //node.imprimirEstadoDeLaRed();
        }, 5000);
    } catch (error) {
        console.log(error)

    }
}

main()