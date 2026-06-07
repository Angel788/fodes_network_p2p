import { createLibp2p } from 'libp2p'
import { tcp } from '@libp2p/tcp'
import { noise } from '@chainsafe/libp2p-noise'
import { yamux } from '@chainsafe/libp2p-yamux'
import { circuitRelayServer, circuitRelayTransport } from '@libp2p/circuit-relay-v2'
import { identify } from '@libp2p/identify'
import { multiaddr } from '@multiformats/multiaddr'

async function runTest() {
    console.log('1. Iniciando los nodos...\n')
    // =========================================================
    // NODO B (El Oyente / Aislado)
    // =========================================================
    const listenerNode = await createLibp2p({
        // Nota: NO hay bloque 'addresses.listen'
        // Este nodo simula estar detrás de un firewall, no escucha conexiones entrantes directas
        transports: [
            tcp(),
            circuitRelayTransport({
                // Esto le dice al nodo que intente reservar un slot automáticamente 
                // en cualquier Relay al que se conecte.
            })
        ],
        connectionEncrypters: [noise()],
        streamMuxers: [yamux()],
        services: { identify: identify() }
    })

    // =========================================================
    // NODO A (El Cliente / Dialer)
    // =========================================================
    const dialerNode = await createLibp2p({
        transports: [
            tcp(),
            // Necesita este transporte para poder interpretar y marcar
            // direcciones que contengan "/p2p-circuit"
            circuitRelayTransport()
        ],
        connectionEncrypters: [noise()],
        streamMuxers: [yamux()],
        services: { identify: identify() }
    })

    // --- EJECUCIÓN DE LA PRUEBA ---

    // A) Obtenemos la dirección del Relay
    const relayAddr = multiaddr("/ip4/136.111.150.103/tcp/1080/p2p/12D3KooWCUn4CPAQF38fLag8dqYGaXkx8MXhFjdrBLEJWv7eixyg");
    console.log(`📡 Relay escuchando en: ${relayAddr.toString()}`)

    // B) El Nodo B (Aislado) se conecta al Relay
    console.log('🔗 Nodo B conectándose al Relay para pedir reserva...')
    await listenerNode.dial(relayAddr)

    // Le damos un segundo para que la negociación del circuito se complete por detrás
    await new Promise(resolve => setTimeout(resolve, 1000))

    // Ahora el Nodo B debería tener una nueva dirección pública prestada por el Relay
    const listenerCircuitAddrs = listenerNode.getMultiaddrs()
    const circuitAddr = listenerCircuitAddrs.find(addr => addr.toString().includes('/p2p-circuit'))

    if (!circuitAddr) {
        console.error('❌ El Nodo B no pudo obtener una dirección de circuito.')
        process.exit(1)
    }
    console.log(`\n✅ Dirección de circuito del Nodo B obtenida:\n   ${circuitAddr.toString()}\n`)

    // C) El Nodo A hace dial al Nodo B usando EXCLUSIVAMENTE el circuito
    console.log('🚀 Nodo A llamando al Nodo B a través del circuito...')
    const connection = await dialerNode.dial(circuitAddr)

    console.log('\n🎉 ¡CONEXIÓN EXITOSA!')
    console.log(`   El Nodo A se ha conectado con: ${connection.remotePeer.toString()}`)
    console.log(`   A través de la dirección remota: ${connection.remoteAddr.toString()}`)

    // Limpieza al terminar
    await dialerNode.stop()
    await listenerNode.stop()
}

runTest().catch(console.error)