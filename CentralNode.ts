import { RedisClient } from "./CentralModules/RedisClient.js";
import { getPublicIP } from "./CentralModules/GCP_IP.js"
import { CentralNode } from "./modules/Node/CentralNode.js"

const main = async () => {
    try {
        const ip = await getPublicIP()
        const node = await CentralNode.create(ip);
        console.log(node.getDirections())
        //const redisClient = RedisClient.getInstance();
        //(await redisClient).set("BoostrapNode", node.getMultiaddrs()[0].toString());
        setInterval(async () => {
            node.imprimirEstadoDeLaRed();
        }, 5000);
    } catch (error) {
        console.log("Existe un error: " + error)
    }
}

main()