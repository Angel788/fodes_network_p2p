import { performance } from 'perf_hooks'
import fs from 'fs'
import path from 'path'
import { NormalNode } from '../modules/Node/NormalNode.js'
import { fileURLToPath } from 'url'
import { Console } from 'console'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '../..')

// Configuración desde argumentos
const startPort = parseInt(process.argv[2]) || 1080
const bootstrapAddr = process.argv[3]
const processIndex = parseInt(process.argv[4]) || 0
const NODES_PER_PROCESS = 5

async function run() {
    // 0. Cargar Mock Data
    const mockDataPath = path.join(__dirname, 'mock_publications.json')
    if (!fs.existsSync(mockDataPath)) {
        console.error(`Error: mock_publications.json no encontrado en ${mockDataPath}`)
        process.exit(1)
    }
    const mockData = JSON.parse(fs.readFileSync(mockDataPath, 'utf-8'))

    // 1. Cargar PSK y normalizar rigurosamente para libp2p (formato Unix)
    const swarmKeyPath = path.join(projectRoot, 'NETWORK', 'swarm.key')
    const pskLines = fs.readFileSync(swarmKeyPath, 'utf-8')
        .split('\n')
        .map(l => l.trim())
        .filter(l => l.length > 0)
    const psk = new TextEncoder().encode(pskLines.join('\n') + '\n')

    const nodes: any[] = []
    const blockSize = 5 // Reducido para evitar saturación

    console.log(`[Process ${processIndex}] Inicializando ${NODES_PER_PROCESS} nodos (Conexión en segundo plano)...`)

    // 2. Inicializar Nodos en este proceso
    for (let i = 0; i < NODES_PER_PROCESS; i++) {
        const nodeIndex = (processIndex * NODES_PER_PROCESS) + i
        const port = startPort + i

        const userDir = path.join(__dirname, 'dbs', `node_${nodeIndex}`)
        process.env.GATEWAY_USER_DATA = userDir

        if (fs.existsSync(userDir)) fs.rmSync(userDir, { recursive: true, force: true })
        fs.mkdirSync(userDir, { recursive: true })

        // Crear nodo
        const node = await NormalNode.create('2806:105e:1:5be8:c056:9621:2843:d1ab', psk, bootstrapAddr, port)

        // Conexión al bootstrap con delay escalonado y reintentos
        if (bootstrapAddr) {
            const startDelay = 500 + Math.random() * 2000
            await new Promise(r => setTimeout(r, startDelay))

            let connected = false
            for (let attempt = 0; attempt < 3 && !connected; attempt++) {
                try {
                    await node.contact(bootstrapAddr)
                    connected = true
                } catch (e) {
                    await new Promise(r => setTimeout(r, 2000 + Math.random() * 3000))
                }
            }
        }

        const db = node.getDb()

        // Poblar DB
        const savePromises = []
        for (let j = 0; j < blockSize; j++) {
            // Usar una selección determinista pero distribuida para asegurar cobertura
            const idx = (nodeIndex * blockSize + j) % mockData.length
            const item = mockData[idx]
            savePromises.push(db.saveContent(item.cid, item.data))
        }
        await Promise.all(savePromises)
        node.provideCurrentContentSavedInDb()

        nodes.push({ node, db, nodeIndex })

        // Delay para ceder el event loop
        await new Promise(r => setTimeout(r, 100))
    }

    // Notificar que el proceso levantó los nodos (aunque sigan conectándose en background)
    if (process.send) process.send({ type: 'ready', processIndex })

    // 3. Esperar señal 'start_queries' del runner
    await new Promise((resolve) => {
        const handler = (msg: any) => {
            if (msg === 'start_queries' || msg.type === 'start_queries') {
                process.off('message', handler)
                resolve(true)
            }
        }
        process.on('message', handler)
    })

    console.log(`[Process ${processIndex}] Iniciando bloque de consultas...`)

    // 4. Ejecutar Consultas
    const queryPromises = nodes.map(async ({ node, nodeIndex }) => {
        let lastBytesIn = 0
        let lastBytesOut = 0
        let lastCheckTime = performance.now()

        for (let i = 0; i < blockSize; i++) {
            const targetIdx = Math.floor(Math.random() * mockData.length);
            const target = mockData[targetIdx]

            const start = performance.now()
            let success = false
            let latency = 0

            try {
                const res = await node.getContent(target.cid, '/forum/posts/1.0.0')
                latency = performance.now() - start
                if (res) success = true
            } catch (e) {
                latency = performance.now() - start
            }

            // Calcular throughput
            const now = performance.now()
            const durationSec = (now - lastCheckTime) / 1000

            let bytesIn = 0
            let bytesOut = 0

            const metrics = (node.node as any).metrics
            if (metrics?.registry) {
                try {
                    const transferMetric = await metrics.registry.getSingleMetric('libp2p_data_transfer_bytes_total').get()
                    if (transferMetric && transferMetric.values) {
                        for (const val of transferMetric.values) {
                            if (val.labels.direction === 'inbound') bytesIn += val.value
                            if (val.labels.direction === 'outbound') bytesOut += val.value
                        }
                    }
                } catch (e) {
                    // Metric might not be registered yet
                }
            }

            const throughputIn = (bytesIn - lastBytesIn) / (durationSec || 1)
            const throughputOut = (bytesOut - lastBytesOut) / (durationSec || 1)

            lastBytesIn = bytesIn
            lastBytesOut = bytesOut
            lastCheckTime = now

            // DHT Size
            const dht = (node.node.services.dht as any)
            const dhtSize = dht?.routingTable?.size || 0

            if (process.send) {
                process.send({ type: 'search_result', latency, success, nodeIndex })
                process.send({
                    type: 'metrics',
                    data: {
                        nodeIndex,
                        heapMemory: process.memoryUsage().heapUsed / NODES_PER_PROCESS,
                        peerCount: node.node.getPeers().length,
                        dhtSize,
                        throughputIn: (throughputIn * 8).toFixed(2), // bits per second
                        throughputOut: (throughputOut * 8).toFixed(2), // bits per second
                        lastSearchLatency: latency,
                        timestamp: new Date().toISOString()
                    }
                })
            }
            await new Promise(r => setTimeout(r, 2000 + Math.random() * 1000))
        }
    })

    await Promise.all(queryPromises)

    if (process.send) process.send({ type: 'done_queries', processIndex })

    process.on('message', async (msg: any) => {
        if (msg === 'shutdown' || msg.type === 'shutdown') {
            for (const { node, db } of nodes) {
                try {
                    await node.node.stop()
                    await db.close()
                } catch (e) { }
            }
            process.exit(0)
        }
    })
}

run().catch(err => {
    console.error(`Fatal error in Process ${processIndex}:`, err)
    process.exit(1)
})
