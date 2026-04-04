
import { NormalNode } from "./modules/Node/NormalNode.js"
//import axios from 'axios';
import { NodeGateway } from "./NormalNodeModules/NodeGateway.js";
import { getLocalIPv6 } from "./NormalNodeModules/ip.js"
interface DireccionLibp2p {
    BoostrapNode: string
}


const main = async () => {
    try {
        const ip6 = await getLocalIPv6()
        const dir = '/ip4/35.224.81.61/tcp/1080/p2p/12D3KooWENU1sWxD59ezSxkUiU7Ah3aMSsc3vDkywH3akFkBoj5x';//await axios.get<DireccionLibp2p>('http://192.168.1.67:8000/directionBoostrapNode');
        const node = await NormalNode.create(ip6, dir);
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