
import { NormalNode } from "./modules/Node/NormalNode.js"
//import axios from 'axios';
import { NodeGateway } from "./NormalNodeModules/NodeGateway.js";

interface DireccionLibp2p {
    BoostrapNode: string
}


const main = async () => {
    try {
        const node = await NormalNode.create();
        const nodeGateway = new NodeGateway(node)
        console.log(node.id);
        const dir = '/ip4/136.113.56.80/tcp/1080/p2p/12D3KooWPzkFYx1kgvgwsD3KxyX8NdenXjTXjzbsC4dyXgPYqm7t';//await axios.get<DireccionLibp2p>('http://192.168.1.67:8000/directionBoostrapNode');
        node.contact(dir);
    } catch (error) {
        console.log(error)

    }
    setInterval(async () => {

    }, 5000);
}

main()