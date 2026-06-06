import { fork } from 'child_process'
import path from 'path'
import fs from 'fs'
import { pathToFileURL, fileURLToPath } from 'url'
import { CentralNode } from '../modules/Node/CentralNode.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const NUM_NODES = 3
const BASE_PORT = 11000
const STARTUP_DELAY_MS = 200

const gatewayPath = path.resolve(__dirname, '..')
const tsxPath = pathToFileURL(path.join(gatewayPath, 'node_modules/tsx/dist/esm/index.mjs')).href
const nodeScriptPath = path.join(__dirname, 'quick-node.mts')

async function runQuickBenchmark() {
    console.log(`🚀 Iniciando Quick Benchmark (${NUM_NODES} nodos)...`)

    // 1. Iniciar Bootstrap Node Local (CentralNode)
    const swarmKeyPath = path.join(gatewayPath, 'swarm.key')
    const psk = fs.readFileSync(swarmKeyPath)
    
    console.log('📡 Iniciando Nodo Bootstrap en 127.0.0.1:11000...')
    const bootstrapNode = await CentralNode.create('127.0.0.1', psk)
    const bootstrapAddr = bootstrapNode.getMultiaddrs()[0].toString()
    console.log(`✅ Bootstrap listo: ${bootstrapAddr}`)

    const activeNodes: Map<number, any> = new Map()
    const nodeAddrs: string[] = []
    const searchLatencies: any[] = []
    const peerCounts: number[] = []
    let nodesFinished = 0

    const spawnNode = (index: number) => {
        return new Promise((resolve) => {
            const child = fork(nodeScriptPath, [
                (BASE_PORT + index + 1).toString(),
                bootstrapAddr,
                index.toString()
            ], {
                stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
                execArgv: ['--import', tsxPath],
                cwd: gatewayPath
            })

            child.on('message', (msg: any) => {
                if (msg.type === 'ready') {
                    nodeAddrs.push(msg.multiaddr)
                    resolve(child)
                } else if (msg.type === 'metrics') {
                    peerCounts.push(msg.data.peerCount)
                } else if (msg.type === 'search_result') {
                    console.log(`[Runner] Resultado de búsqueda: ${msg.success ? 'Éxito' : 'Fallo'} (${msg.latency.toFixed(2)}ms)`)
                    if (msg.success) searchLatencies.push(msg.latency)
                } else if (msg.type === 'done_queries') {
                    nodesFinished++
                    console.log(`[Runner] Nodo ${nodesFinished}/${NUM_NODES} completó sus tareas.`)
                }
            })

            child.on('exit', (code) => {
                activeNodes.delete(index)
            })

            activeNodes.set(index, child)
        })
    }

    // 2. Iniciar Nodos
    for (let i = 0; i < NUM_NODES; i++) {
        await spawnNode(i)
        await new Promise(r => setTimeout(r, STARTUP_DELAY_MS))
    }

    // 3. Informar a cada nodo de todos los demás para forzar conexión directa
    console.log('🔗 Conectando nodos entre sí...')
    for (const [index, child] of activeNodes.entries()) {
        child.send({ type: 'all_nodes', addrs: nodeAddrs })
    }

    console.log('⏳ Esperando a que los nodos terminen sus tareas...')
    const startWait = Date.now()
    while(nodesFinished < NUM_NODES && Date.now() - startWait < 60000) {
        await new Promise(r => setTimeout(r, 1000))
    }

    if (nodesFinished < NUM_NODES) {
        console.log('⚠️ Tiempo de espera agotado. Algunos nodos no terminaron limpiamente.')
    }

    console.log('\nFinalizando benchmark y apagando nodos...')
    for (const child of activeNodes.values()) {
        child.send('shutdown')
    }
    await new Promise(r => setTimeout(r, 2000))

    // 4. Resultados
    const expectedSearches = NUM_NODES * 3
    const successfulSearches = searchLatencies.length
    const successRate = (successfulSearches / expectedSearches) * 100

    const avgLatency = successfulSearches > 0 
        ? searchLatencies.reduce((a, b) => a + b, 0) / successfulSearches 
        : 0
    const avgPeers = peerCounts.length > 0 
        ? peerCounts.reduce((a, b) => a + b, 0) / peerCounts.length 
        : 0

    console.log('\n--- 📊 RESULTADOS RÁPIDOS ---')
    console.log(`Nodos probados: ${NUM_NODES}`)
    console.log(`Tasa de éxito de búsqueda: ${successRate.toFixed(2)}% (${successfulSearches}/${expectedSearches})`)
    console.log(`Conexiones directas promedio: ${avgPeers.toFixed(2)}`)
    console.log(`Latencia de búsqueda promedio: ${avgLatency.toFixed(2)} ms`)
    console.log('-----------------------------\n')

    await bootstrapNode.node.stop()
    process.exit(0)
}

runQuickBenchmark().catch(err => {
    console.error('Error en el runner:', err)
    process.exit(1)
})
