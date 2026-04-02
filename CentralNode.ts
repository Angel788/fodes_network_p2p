import { RedisClient } from "./CentralModules/RedisClient.js";
import { CentralNode } from "./modules/Node/CentralNode.js"


const main = async () => {
    try {
        const ip = process.argv[2]
        console.log(ip)
        const node = await CentralNode.create(ip);
        console.log(node.getDirections())
        const redisClient = RedisClient.getInstance();
        (await redisClient).set("BoostrapNode", node.getMultiaddrs()[0].toString());
        setInterval(async () => {
        }, 5000);
    } catch (error) {
        console.log("Existe un error: " + error)
    }
}

main()