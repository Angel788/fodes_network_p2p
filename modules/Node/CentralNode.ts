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
import { preSharedKey } from '@libp2p/pnet';
import { prometheusMetrics } from '@libp2p/prometheus-metrics'
export class CentralNode extends NodeLibp2p {
    public static async create(ip: string, psk: Uint8Array): Promise<CentralNode> {
        const instance = new CentralNode();
        instance.node = await createLibp2p({
            connectionManager: {
                maxConnections: 50000,
            },
            metrics: prometheusMetrics(),
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
                    clientMode: false
                }),
                autoNAT: autoNAT(),
                relay: circuitRelayServer({
                    reservations: {
                        maxReservations: 500,
                        reservationTtl:  7200000 // 2 horas en ms
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