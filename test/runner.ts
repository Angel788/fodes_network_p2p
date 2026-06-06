import { fork } from 'child_process'
import path from 'path'
import fs from 'fs'
import { pathToFileURL, fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const NUM_NODES = 40 // Ajustable a 500
const BASE_PORT = 10000
const STARTUP_DELAY_MS = 1000
const OUTPUT_FILE = path.join(__dirname, 'benchmark_results.csv')
const SEARCH_LOG = path.join(__dirname, 'search_latencies.csv')

const gatewayPath = path.resolve(__dirname, '..')
const tsxPath = pathToFileURL(path.join(gatewayPath, 'node_modules/tsx/dist/esm/index.mjs')).href
const nodeScriptPath = path.join(__dirname, 'node-test.mts')

async function runBenchmark() {
    console.log(`Iniciando prueba de rendimiento determinista (${NUM_NODES} nodos)...`)

    const activeNodes: Map<number, any> = new Map()
    const escomBootstrap = '/ip4/136.111.150.103/tcp/1080/p2p/12D3KooWCUn4CPAQF38fLag8dqYGaXkx8MXhFjdrBLEJWv7eixyg'
    const allMetrics: any[] = []
    const searchLatencies: any[] = []
    
    let nodesFinished = 0

    // Preparar archivos
    if (!fs.existsSync(path.join(__dirname, 'dbs'))) fs.mkdirSync(path.join(__dirname, 'dbs'), { recursive: true })
    fs.writeFileSync(OUTPUT_FILE, 'nodeIndex,timestamp,heapMemory,peerCount,lastSearchLatency\n')
    fs.writeFileSync(SEARCH_LOG, 'timestamp,latency,success\n')

    const spawnNode = (index: number, bAddr: string) => {
        return new Promise((resolve) => {
            const child = fork(nodeScriptPath, [
                (BASE_PORT + index).toString(),
                bAddr,
                index.toString()
            ], {
                stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
                execArgv: ['--import', tsxPath],
                cwd: gatewayPath
            })


            child.on('message', (msg: any) => {
                if (msg.type === 'ready') {
                    resolve(child)
                } else if (msg.type === 'metrics') {
                    allMetrics.push(msg.data)
                    fs.appendFileSync(OUTPUT_FILE, `${msg.data.nodeIndex},${msg.data.timestamp},${msg.data.heapMemory},${msg.data.peerCount},${msg.data.lastSearchLatency}\n`)
                } else if (msg.type === 'search_result') {
                    searchLatencies.push(msg)
                    fs.appendFileSync(SEARCH_LOG, `${new Date().toISOString()},${msg.latency},${msg.success}\n`)
                } else if (msg.type === 'done_queries') {
                    nodesFinished++
                    console.log(`[TEST] Nodo completó sus consultas. (${nodesFinished}/${NUM_NODES})`)
                }
            })

            child.on('exit', () => {
                activeNodes.delete(index)
            })

            activeNodes.set(index, child)
        })
    }

    // Iniciar TODOS los nodos conectados directamente al Bootstrap ESCOM
    console.log(`Conectando todos los nodos a: ${escomBootstrap}`)
    for (let i = 0; i < NUM_NODES; i++) {
        await spawnNode(i, escomBootstrap)
        await new Promise(r => setTimeout(r, STARTUP_DELAY_MS))
    }

    console.log(`Red activa. Esperando a que todos los nodos finalicen sus consultas...`)

    // Esperar hasta que todos reporten haber terminado sus consultas
    while(nodesFinished < NUM_NODES) {
        await new Promise(r => setTimeout(r, 1000))
    }

    console.log('\nFinalizando benchmark y apagando nodos...')
    
    // Apagar todos los nodos de forma coordinada
    for (const child of activeNodes.values()) {
        child.send('shutdown')
    }

    // Pequeña espera para que los procesos cierren limpiamente
    await new Promise(r => setTimeout(r, 2000))

    // Análisis
    const successSearches = searchLatencies.filter(s => s.success)
    const avgLatency = successSearches.reduce((s, m) => s + m.latency, 0) / (successSearches.length || 1)
    const successRate = (searchLatencies.length > 0) ? (successSearches.length / searchLatencies.length) * 100 : 0

    console.log('\n--- RESULTADOS DEL BENCHMARK (FINITO) ---')
    console.log(`Nodos Totales: ${NUM_NODES}`)
    console.log(`Búsquedas Esperadas: ${NUM_NODES * 20}`)
    console.log(`Búsquedas Realizadas: ${searchLatencies.length}`)
    console.log(`Tasa de éxito: ${successRate.toFixed(2)}%`)
    console.log(`Latencia promedio (éxitos): ${avgLatency.toFixed(2)} ms`)
    console.log(`\nLos archivos CSV están listos en gateway/test/ para tu análisis.`)
}

runBenchmark().catch(console.error)
