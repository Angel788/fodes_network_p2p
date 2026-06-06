import { CID } from 'multiformats/cid'
import { performance } from 'perf_hooks'
import fs from 'fs'
import path from 'path'
import { NormalNode } from '../modules/Node/NormalNode.js'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')

// Configuración desde argumentos
const port = parseInt(process.argv[2]) || 1080
const bootstrapAddr = process.argv[3]
const nodeIndex = parseInt(process.argv[4]) || 0

async function run() {
    // 0. Cargar Mock Data
    const mockDataPath = path.join(__dirname, 'mock_publications_200.json')
    const mockData = JSON.parse(fs.readFileSync(mockDataPath, 'utf-8'))

    // 1. Cargar PSK
    const swarmKeyPath = path.join(projectRoot, 'swarm.key')
    const psk = fs.readFileSync(swarmKeyPath)

    // 2. Configurar DB (LevelDB)
    const userDir = path.join(__dirname, 'dbs', `node_${nodeIndex}`)
    process.env.GATEWAY_USER_DATA = userDir
    
    // Para esta prueba determinista, siempre limpiamos la DB
    if (fs.existsSync(userDir)) fs.rmSync(userDir, { recursive: true, force: true })
    fs.mkdirSync(userDir, { recursive: true })

    // 3. Iniciar NormalNode
    const node = await NormalNode.create(null, psk, port)
    
    if (bootstrapAddr) {
        try {
            await node.contact(bootstrapAddr)
        } catch (e) {}
    }

    const addrs = node.getMultiaddrs()
    const localAddr = addrs.find(ma => ma.toString().includes('127.0.0.1') && ma.toString().includes('/tcp/'))
    const multiaddr = (localAddr || addrs[0] || '').toString()
    
    if (process.send) process.send({ type: 'ready', multiaddr })

    // 4. Poblar DB con exactamente 20 publicaciones únicas
    const db = node.getDb()
    const myContent: string[] = []
    
    for (let i = 0; i < 5; i++) {
        let item;
        do {
            item = mockData[Math.floor(Math.random() * mockData.length)]
        } while (myContent.includes(item.cid_content))
        
        const { cid_content, ...payload } = item
        await db.saveContent(cid_content, payload as any)
        myContent.push(cid_content)
    }
    
    // Anunciar a la red
    node.provideCurrentContentSavedInDb()

    // 5. Esperar propagación del DHT
    await new Promise(r => setTimeout(r, 5000))

    // 6. Ejecutar exactamente 20 Queries
    for (let i = 0; i < 5; i++) {
        let target;
        do {
            target = mockData[Math.floor(Math.random() * mockData.length)]
        } while (myContent.includes(target.cid_content))

        const start = performance.now()
        try {
            const res = await node.getContent(target.cid_content, '/forum/posts/1.0.0')
            const latency = performance.now() - start
            const success = !!res
            
            if (process.send) process.send({ type: 'search_result', latency, success })
        } catch (e) {
            if (process.send) process.send({ type: 'search_result', latency: -1, success: false })
        }

        // Reporte de métricas por query
        if (process.send) {
            process.send({
                type: 'metrics',
                data: {
                    nodeIndex,
                    heapMemory: process.memoryUsage().heapUsed,
                    peerCount: node.node.getPeers().length,
                    lastSearchLatency: 0,
                    timestamp: new Date().toISOString()
                }
            })
        }

        // Breve pausa para no bloquear la red local
        await new Promise(r => setTimeout(r, 1000))
    }

    // 7. Notificar finalización de consultas pero QUEDARSE VIVO
    if (process.send) process.send({ type: 'done_queries' })
    console.log(`[Node ${nodeIndex}] Consultas completadas. Permaneciendo en línea para servir contenido...`)

    // Esperar señal de apagado del runner
    process.on('message', async (msg: any) => {
        if (msg === 'shutdown' || msg.type === 'shutdown') {
            console.log(`[Node ${nodeIndex}] Recibida señal de apagado. Cerrando...`)
            await node.node.stop()
            await db.close()
            process.exit(0)
        }
    })
}

run().catch(err => {
    console.error(`Fatal error in Node ${nodeIndex}:`, err)
    process.exit(1)
})
