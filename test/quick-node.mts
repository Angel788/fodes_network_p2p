import { performance } from 'perf_hooks'
import fs from 'fs'
import path from 'path'
import { NormalNode } from '../modules/Node/NormalNode.js'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '../..')

const port = parseInt(process.argv[2]) || 11001
const bootstrapAddr = process.argv[3]
const nodeIndex = parseInt(process.argv[4]) || 0

async function run() {
    const mockDataPath = path.join(__dirname, 'mock_publications_200.json')
    const mockData = JSON.parse(fs.readFileSync(mockDataPath, 'utf-8'))

    const swarmKeyPath = path.join(projectRoot, 'gateway', 'swarm.key')
    const psk = fs.readFileSync(swarmKeyPath)

    const userDir = path.join(__dirname, 'dbs', `quick_node_${nodeIndex}`)
    process.env.GATEWAY_USER_DATA = userDir
    
    if (fs.existsSync(userDir)) fs.rmSync(userDir, { recursive: true, force: true })
    fs.mkdirSync(userDir, { recursive: true })

    const node = await NormalNode.create(psk, bootstrapAddr, port)
    
    if (bootstrapAddr) {
        try {
            await node.contact(bootstrapAddr)
        } catch (e) {}
    }

    const addrs = node.getMultiaddrs()
    const multiaddr = (addrs[0] || '').toString()
    
    if (process.send) process.send({ type: 'ready', multiaddr, peerId: node.id })

    // Manejar mensajes del runner para conectar con otros nodos
    process.on('message', async (msg: any) => {
        if (msg.type === 'all_nodes') {
            for (const addr of msg.addrs) {
                if (addr !== multiaddr) {
                    try { await node.contact(addr) } catch {}
                }
            }
        }
    })

    const db = node.getDb()
    const myContent: string[] = []
    
    // Publicar solo 5 items
    for (let i = 0; i < 5; i++) {
        let item = mockData[(nodeIndex * 5 + i) % mockData.length]
        const { cid_content, ...payload } = item
        await db.saveContent(cid_content, payload as any)
        myContent.push(cid_content)
    }
    
    // No usamos provideCurrentContentSavedInDb() porque es lento en el DHT
    // node.provideCurrentContentSavedInDb()

    // Esperar a tener al menos un par de conexiones directas (max 5s)
    const startWait = Date.now()
    while (node.node.getPeers().length <= 1 && Date.now() - startWait < 5000) {
        await new Promise(r => setTimeout(r, 200))
    }

    // Ejecutar solo 3 Queries
    for (let i = 0; i < 3; i++) {
        // Buscar algo que otro nodo tenga (simple rotación)
        let targetNodeIndex = (nodeIndex + 1) % 3
        let targetItemIndex = (targetNodeIndex * 5 + i) % mockData.length
        let target = mockData[targetItemIndex]

        const start = performance.now()
        try {
            const res = await node.getContent(target.cid_content, '/forum/posts/1.0.0')
            const latency = performance.now() - start
            const success = !!res
            
            if (process.send) process.send({ type: 'search_result', latency, success, targetNodeIndex })
        } catch (e) {
            if (process.send) process.send({ type: 'search_result', latency: -1, success: false })
        }

        if (process.send) {
            process.send({
                type: 'metrics',
                data: {
                    nodeIndex,
                    peerCount: node.node.getPeers().length,
                    timestamp: new Date().toISOString()
                }
            })
        }

        await new Promise(r => setTimeout(r, 100) )
    }

    // Notificar que terminó sus tareas pero quedarse vivo
    if (process.send) process.send({ type: 'done_queries' })
    console.log(`[QuickNode ${nodeIndex}] Tareas completadas. Sirviendo contenido...`)

    process.on('message', async (msg: any) => {
        if (msg === 'shutdown' || msg.type === 'shutdown') {
            await node.node.stop()
            await db.close()
            process.exit(0)
        }
    })
}

run().catch(err => {
    console.error(`Error in Quick Node ${nodeIndex}:`, err)
    process.exit(1)
})
