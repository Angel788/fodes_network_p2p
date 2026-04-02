
import { NormalNode } from "./modules/Node/NormalNode.js"
import axios from 'axios';
import { NodeGateway } from "./NormalNodeModules/NodeGateway.js";

interface DireccionLibp2p {
    BoostrapNode: string
}


const main = async () => {
    try {
        const node = await NormalNode.create();
        const nodeGateway = new NodeGateway(node)
        console.log(node.id);
        const dir = await axios.get<DireccionLibp2p>('http://192.168.1.67:8000/directionBoostrapNode');
        console.log(dir.data)
        node.contact(dir.data.BoostrapNode);
    } catch (error) {
        console.log(error)

    }
    setInterval(async () => {

    }, 5000);
}

main()