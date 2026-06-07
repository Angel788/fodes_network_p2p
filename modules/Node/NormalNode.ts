import { createLibp2p } from 'libp2p'
import { tcp } from '@libp2p/tcp'
import { noise } from '@chainsafe/libp2p-noise'
import { yamux } from '@chainsafe/libp2p-yamux'
import { identify, identifyPush } from '@libp2p/identify'
import { ping } from '@libp2p/ping'
import { kadDHT } from '@libp2p/kad-dht'
import { NodeLibp2p } from './NodeLibp2p.js'
import { circuitRelayTransport } from '@libp2p/circuit-relay-v2'
import { dcutr } from '@libp2p/dcutr'
import { autoNAT } from '@libp2p/autonat'
import { mdns } from '@libp2p/mdns'
import { uPnPNAT } from '@libp2p/upnp-nat'
import { preSharedKey } from '@libp2p/pnet'
import { keys } from '@libp2p/crypto'
import { prometheusMetrics } from '@libp2p/prometheus-metrics'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'

async function loadOrCreatePrivateKey(dbPath: string = '.db'): Promise<Awaited<ReturnType<typeof keys.generateKeyPair>>> {
    mkdirSync(path.resolve(dbPath), { recursive: true })
    const keyPath = path.join(path.resolve(dbPath), 'peer.key')
    if (existsSync(keyPath)) {
        const buf = readFileSync(keyPath)
        return keys.privateKeyFromProtobuf(buf) as any
    }
    const privateKey = await keys.generateKeyPair('Ed25519')
    writeFileSync(keyPath, keys.privateKeyToProtobuf(privateKey))
    return privateKey
}

export class NormalNode extends NodeLibp2p {
    static async create(ip:string,psk: Uint8Array, bootstrapAddr?: string, port: number = 1080): Promise<NormalNode> {
        const instance = new NormalNode();
        await instance.nodeDb.initDb();
        const keyDbPath = process.env.GATEWAY_USER_DATA
            ? path.join(process.env.GATEWAY_USER_DATA, '.db')
            : '.db'
        const privateKey = await loadOrCreatePrivateKey(keyDbPath)

        const listenAddrs = [`/ip4/0.0.0.0/tcp/${port}`, `/ip6/::/tcp/${port}`];
        if (bootstrapAddr) listenAddrs.push(bootstrapAddr + '/p2p-circuit');

        instance.node = await createLibp2p({
            privateKey,
            connectionManager: {
                maxConnections: 5000,
            },
            metrics: prometheusMetrics(),
            addresses: {
                listen: listenAddrs,
                // Sin announce manual: autoNAT e identify descubren la IP pública real.
                // El circuitRelayTransport añade automáticamente la dirección relay
                // del bootstrap una vez que obtiene la reserva.
                announce: ip ? ['/ip6/' + ip + '/tcp/'+port] : []
            },
            transports: [
                tcp(),
                circuitRelayTransport()
            ],
            streamMuxers: [yamux()],
            connectionEncrypters: [noise()],
            peerDiscovery: [mdns()],
            services: {
                identify: identify(),
                identifyPush: identifyPush(),
                ping: ping(),
                dht: kadDHT({
                    protocol: '/fodes',
                    clientMode: false
                }),
                autonat: autoNAT(),
                dcutr: dcutr(),
                upnp: uPnPNAT()
            },
            transportManager: {
                faultTolerance: 1 
            },
            connectionProtector: preSharedKey({
                psk: psk
            })
        });
        instance.id = instance.node.peerId.toString();
        await instance.start();

        return instance;
    }
}