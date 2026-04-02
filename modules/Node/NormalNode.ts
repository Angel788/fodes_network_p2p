import { createLibp2p, Libp2p } from 'libp2p'
import { tcp } from '@libp2p/tcp'
import { noise } from '@chainsafe/libp2p-noise'
import { yamux } from '@chainsafe/libp2p-yamux'
import { identify, identifyPush } from '@libp2p/identify'
import { ping } from '@libp2p/ping'
import { kadDHT, removePublicAddressesMapper } from '@libp2p/kad-dht';
import { bootstrap } from '@libp2p/bootstrap'
import { NodeLibp2p } from './NodeLibp2p.js'
export class NormalNode extends NodeLibp2p {
    public static async create(): Promise<NormalNode> {
        const instance = new NormalNode();
        instance.node = await createLibp2p({
            addresses: {
                listen: ['/ip4/0.0.0.0/tcp/1080']
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
                    clientMode: false,
                    peerInfoMapper: removePublicAddressesMapper
                }),
            }
        });
        instance.id = instance.node.peerId.toString();
        instance.start();
        instance.nodeDb.initDb()
        return instance;
    }
}