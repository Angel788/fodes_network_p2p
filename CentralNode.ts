import { RedisClient } from "./CentralModules/RedisClient.js";
import { getPublicIP, getPublicIPv6 } from "./CentralModules/GCP_IP.js"
import { CentralNode } from "./modules/Node/CentralNode.js"
import { readFileSync } from "node:fs";

const main = async () => {
    try {
        const psk  = readFileSync('./swarm.key');
        const ip4  = await getPublicIP();
        const ip6  = await getPublicIPv6();
        console.log(`[Bootstrap] IPv4: ${ip4} | IPv6: ${ip6 ?? 'no disponible'}`);
        const node = await CentralNode.create(ip4, psk, ip6);
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

// Node.js 22 mata el proceso en unhandledRejection por defecto.
// libp2p lanza StreamAbortEvent/StreamResetEvent como promesas rechazadas
// al cerrarse streams — los ignoramos para que el Bootstrap no crashee.
process.on('unhandledRejection', (reason) => {
    const msg = String((reason as any)?.message ?? reason)
    if (
        msg.includes('StreamReset') ||
        msg.includes('StreamAbort') ||
        msg.includes('stream reset') ||
        msg.includes('stream abort') ||
        msg.includes('connection reset') ||
        msg.includes('aborted')
    ) return
    console.log('[Bootstrap] UnhandledRejection (no fatal):', reason)
})

main()