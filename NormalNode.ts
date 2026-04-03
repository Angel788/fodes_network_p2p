
import { NormalNode } from "./modules/Node/NormalNode.js"
//import axios from 'axios';
import { NodeGateway } from "./NormalNodeModules/NodeGateway.js";
import { getPublicIp } from "./NormalNodeModules/ip.js"
interface DireccionLibp2p {
    BoostrapNode: string
}


const main = async () => {
    try {
        const ip = await getPublicIp()
        const dir = '/ip4/34.122.202.211/tcp/1080/p2p/12D3KooWPndeAMvSBc8s8zMXnJ1Z6xwDxkipQHLCqGRqWPPtaJSN';//await axios.get<DireccionLibp2p>('http://192.168.1.67:8000/directionBoostrapNode');
        const node = await NormalNode.create(ip, dir);
        const nodeGateway = new NodeGateway(node)
        console.log(node.getMultiaddrs());
        node.contact(dir);
        setInterval(async () => {
            node.imprimirEstadoDeLaRed();
        }, 5000);
    } catch (error) {
        console.log(error)

    }
}

main()