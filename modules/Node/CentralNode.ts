import { createLibp2p } from 'libp2p'
import { tcp } from '@libp2p/tcp'
import { noise } from '@chainsafe/libp2p-noise'
import { yamux } from '@chainsafe/libp2p-yamux'
import { identify, identifyPush } from '@libp2p/identify'
import { ping } from '@libp2p/ping'
import { kadDHT } from '@libp2p/kad-dht'
import { NodeLibp2p } from './NodeLibp2p.js'
import { autoNAT } from '@libp2p/autonat'
import { circuitRelayServer } from '@libp2p/circuit-relay-v2'
import { preSharedKey } from '@libp2p/pnet'
import { keys } from '@libp2p/crypto'
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
    console.log('[Bootstrap] Nueva clave generada y guardada. Peer ID estable en futuros reinicios.')
    return privateKey
}

export class CentralNode extends NodeLibp2p {
    public static async create(ip4: string, psk: Uint8Array, ip6: string | null = null): Promise<CentralNode> {
        const instance = new CentralNode();
        const privateKey = await loadOrCreatePrivateKey();

        const listenAddrs  = ['/ip4/0.0.0.0/tcp/1080', '/ip6/::/tcp/1080'];
        const announceAddrs = ['/ip4/' + ip4 + '/tcp/1080'];
        if (ip6) announceAddrs.push('/ip6/' + ip6 + '/tcp/1080');

        instance.node = await createLibp2p({
            privateKey,
            addresses: {
                listen:   listenAddrs,
                announce: announceAddrs
            },
            transports: [tcp()],
            streamMuxers: [yamux()],
            connectionEncrypters: [noise()],
            services: {
                identify: identify(),
                identifyPush: identifyPush(),
                ping: ping(),
                dht: kadDHT({
                    protocol: '/fodes',
                    clientMode: false
                }),
                autoNAT: autoNAT(),
                relay: circuitRelayServer({
                    advertise: true,          // Se anuncia en la DHT como relay server
                    reservations: {
                        maxReservations: 200,
                        reservationTtl: 7200000  // 2 horas
                    }
                })
            },
            connectionProtector: preSharedKey({
                psk: psk
            })
        });
        instance.id = instance.node.peerId.toString();

        await instance.start();
        await instance.nodeDb.initDb();

        return instance;
    }
}