import { RedisClient } from "./CentralModules/RedisClient.js";
import { getPublicIP } from "./CentralModules/GCP_IP.js"
import { CentralNode } from "./modules/Node/CentralNode.js"
import { readFileSync } from "node:fs";

const main = async () => {
    try {
        const psk = readFileSync('./swarm.key');
        const ip = await getPublicIP()
        const node = await CentralNode.create(ip, psk);
        node.provideCurrentContentSavedInDb();
        console.log(node.getDirections())
        //const redisClient = RedisClient.getInstance();
        //(await redisClient).set("BoostrapNode", node.getMultiaddrs()[0].toString());
        setInterval(async () => {
            //node.imprimirEstadoDeLaRed();
        }, 25000);
    } catch (error) {
        console.log("Existe un error: " + error)
    }
}

main()