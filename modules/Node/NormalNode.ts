import { createLibp2p, Libp2p } from 'libp2p'
import { tcp } from '@libp2p/tcp'
import { noise } from '@chainsafe/libp2p-noise'
import { yamux } from '@chainsafe/libp2p-yamux'
import { identify, identifyPush } from '@libp2p/identify'
import { ping } from '@libp2p/ping'
import { kadDHT, removePrivateAddressesMapper } from '@libp2p/kad-dht';
import { bootstrap } from '@libp2p/bootstrap'
import { NodeLibp2p } from './NodeLibp2p.js'
import { circuitRelayTransport } from '@libp2p/circuit-relay-v2'
import { dcutr } from '@libp2p/dcutr'
import { gossipsub } from '@chainsafe/libp2p-gossipsub'
import { autoNAT } from '@libp2p/autonat'
export class NormalNode extends NodeLibp2p {
    static async create(ip: string, bootstrapIp: string): Promise<NormalNode> {
        const instance = new NormalNode();
        instance.node = await createLibp2p({
            addresses: {
                listen: ['/ip4/0.0.0.0/tcp/1080'],
            },
            transports: [
                tcp(),
                circuitRelayTransport()
            ],
            streamMuxers: [yamux()],
            connectionEncrypters: [noise()],
            peerDiscovery: [
                bootstrap({ list: [bootstrapIp] })
            ],
            services: {
                identify: identify(),
                identifyPush: identifyPush(),
                ping: ping(),
                autonat: autoNAT(),
                dht: kadDHT({
                    protocol: '/fodes',
                    clientMode: true,
                }),
                dcutr: dcutr()
            }
        });
        instance.id = instance.node.peerId.toString();
        await instance.node.start();
        await instance.nodeDb.initDb();
        return instance;
    }
}