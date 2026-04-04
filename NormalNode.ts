
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
        const dir = '/ip4/136.111.150.103/tcp/1080/p2p/12D3KooWBRRcJTzjPASozTyqZoDt4oEj8Ye3pLDYyB7RQJgSTPbp';//await axios.get<DireccionLibp2p>('http://192.168.1.67:8000/directionBoostrapNode');
        const node = await NormalNode.create(ip6, psk);
        const nodeGateway = new NodeGateway(node)
        console.log(node.getDirections());
        node.contact(dir);
        setInterval(async () => {
            //node.imprimirEstadoDeLaRed();
        }, 5000);
    } catch (error) {
        console.log(error)

    }
}

main()