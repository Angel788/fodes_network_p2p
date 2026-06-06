import { createLibp2p } from 'libp2p'
import { tcp } from '@libp2p/tcp'
import { noise } from '@chainsafe/libp2p-noise'
import { yamux } from '@chainsafe/libp2p-yamux'
import { identify, identifyPush } from '@libp2p/identify'
import { ping } from '@libp2p/ping'
import { kadDHT } from '@libp2p/kad-dht';
import { NodeLibp2p } from './NodeLibp2p.js'
import { circuitRelayTransport } from '@libp2p/circuit-relay-v2'
import { dcutr } from '@libp2p/dcutr'
import { autoNAT } from '@libp2p/autonat'
import { mdns } from '@libp2p/mdns'
import { preSharedKey } from '@libp2p/pnet';
export class NormalNode extends NodeLibp2p {
    static async create(ip: string | null, psk: Uint8Array): Promise<NormalNode> {
        const instance = new NormalNode();
        instance.node = await createLibp2p({
            addresses: {
                listen: ['/ip4/0.0.0.0/tcp/1080', '/ip6/::/tcp/1080'],
                announce: ip ? ['/ip6/' + ip + '/tcp/1080'] : []
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
                dcutr: dcutr()
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