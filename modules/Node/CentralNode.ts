import { createLibp2p, Libp2p } from 'libp2p'
import { tcp } from '@libp2p/tcp'
import { noise } from '@chainsafe/libp2p-noise'
import { yamux } from '@chainsafe/libp2p-yamux'
import { identify, identifyPush } from '@libp2p/identify'
import { ping } from '@libp2p/ping'
import { kadDHT, removePrivateAddressesMapper } from '@libp2p/kad-dht'
import { NodeLibp2p } from './NodeLibp2p.js'
import { uPnPNAT } from '@libp2p/upnp-nat'
import { autoNAT } from '@libp2p/autonat'
import { circuitRelayServer } from '@libp2p/circuit-relay-v2'
export class CentralNode extends NodeLibp2p {
    public static async create(ip: string): Promise<CentralNode> {
        const instance = new CentralNode();
        console.log(ip)
        instance.node = await createLibp2p({
            addresses: {
                listen: ['/ip4/0.0.0.0/tcp/1080'],
                announce: ['/ip4/' + ip + '/tcp/1080']
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
                    peerInfoMapper: removePrivateAddressesMapper
                }),
                autoNAT: autoNAT(),
                upnpNAT: uPnPNAT(),
                relay: circuitRelayServer({
                    reservations: { applyDefaultLimit: false }
                })
            }
        });
        instance.id = instance.node.peerId.toString();
        instance.start()
        await instance.nodeDb.initDb()
        return instance;
    }
}