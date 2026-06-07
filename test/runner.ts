import { fork } from 'child_process'
import path from 'path'
import fs from 'fs'
import { pathToFileURL, fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const NUM_NODES = 50 
const NODES_PER_PROCESS = 5
const NUM_PROCESSES = Math.ceil(NUM_NODES / NODES_PER_PROCESS)
const BASE_PORT = 11000
const OUTPUT_FILE = path.join(__dirname, 'benchmark_results.csv')
const SEARCH_LOG = path.join(__dirname, 'search_latencies.csv')

const gatewayPath = path.resolve(__dirname, '..')
const tsxPath = pathToFileURL(path.join(gatewayPath, 'node_modules/tsx/dist/esm/index.mjs')).href
const nodeScriptPath = path.join(__dirname, 'node-test.mts')

async function runBenchmark() {
    console.log(`🚀 Iniciando benchmark: ${NUM_NODES} nodos en ${NUM_PROCESSES} procesos (${NODES_PER_PROCESS} nodos/hilo)...`)

    const activeProcesses: Map<number, any> = new Map()
    const escomBootstrap = '/ip4/35.254.223.142/tcp/1080/p2p/12D3KooWCUn4CPAQF38fLag8dqYGaXkx8MXhFjdrBLEJWv7eixyg'
    const searchLatencies: any[] = []
    
    let processesFinished = 0

    // Preparar archivos
    if (!fs.existsSync(path.join(__dirname, 'dbs'))) fs.mkdirSync(path.join(__dirname, 'dbs'), { recursive: true })
    fs.writeFileSync(OUTPUT_FILE, 'nodeIndex,timestamp,heapMemory,peerCount,dhtSize,throughputIn,throughputOut,lastSearchLatency\n')
    fs.writeFileSync(SEARCH_LOG, 'timestamp,latency,success,nodeIndex\n')

    const spawnProcess = (pIndex: number) => {
        return new Promise((resolve) => {
            const child = fork(nodeScriptPath, [
                (BASE_PORT + (pIndex * NODES_PER_PROCESS)).toString(),
                escomBootstrap,
                pIndex.toString()
            ], {
                stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
                execArgv: ['--import', tsxPath],
                cwd: gatewayPath
            })

            child.on('message', (msg: any) => {
                if (msg.type === 'ready') {
                    resolve(child)
                } else if (msg.type === 'metrics') {
                    const d = msg.data
                    fs.appendFileSync(OUTPUT_FILE, `${d.nodeIndex},${d.timestamp},${d.heapMemory},${d.peerCount},${d.dhtSize},${d.throughputIn},${d.throughputOut},${d.lastSearchLatency}\n`)
                } else if (msg.type === 'search_result') {
                    searchLatencies.push(msg)
                    fs.appendFileSync(SEARCH_LOG, `${new Date().toISOString()},${msg.latency},${msg.success},${msg.nodeIndex}\n`)
                } else if (msg.type === 'done_queries') {
                    processesFinished++
                    console.log(`[TEST] Proceso ${pIndex} finalizó todas sus consultas (${processesFinished}/${NUM_PROCESSES})`)
                }
            })

            activeProcesses.set(pIndex, child)
        })
    }

    // 1. Iniciar procesos en paralelo/secuencia controlada
    for (let i = 0; i < NUM_PROCESSES; i++) {
        await spawnProcess(i)
        console.log(`[TEST] Proceso ${i + 1}/${NUM_PROCESSES} listo (${NODES_PER_PROCESS} nodos internos)`)
        await new Promise(r => setTimeout(r, 1000))
    }

    console.log(`\n✅ Red activa. Esperando 15 segundos para estabilización (mDNS/DHT)...`)
    await new Promise(r => setTimeout(r, 15000))

    console.log(`🚀 Enviando señal de inicio a todos los procesos...`)
    for (const child of activeProcesses.values()) {
        child.send('start_queries')
    }

    // 2. Esperar a que todos los procesos terminen sus tareas
    while(processesFinished < NUM_PROCESSES) {
        await new Promise(r => setTimeout(r, 1000))
    }

    console.log('\n🛑 Finalizando y apagando procesos...')
    const shutdownPromises = []
    for (const child of activeProcesses.values()) {
        shutdownPromises.push(new Promise((resolve) => {
            child.on('exit', resolve)
            child.send('shutdown')
        }))
    }

    await Promise.race([
        Promise.all(shutdownPromises),
        new Promise(r => setTimeout(r, 5000))
    ])

    // 3. Análisis de Resultados
    const successSearches = searchLatencies.filter(s => s.success)
    const avgLatency = successSearches.reduce((s, m) => s + m.latency, 0) / (successSearches.length || 1)
    const successRate = (searchLatencies.length > 0) ? (successSearches.length / searchLatencies.length) * 100 : 0

    console.log('\n--- 📊 RESULTADOS DEL BENCHMARK MULTI-HILO ---')
    console.log(`Nodos Totales: ${NUM_NODES}`)
    console.log(`Procesos (Hilos): ${NUM_PROCESSES} (10 nodos c/u)`)
    console.log(`Búsquedas Realizadas: ${searchLatencies.length}`)
    console.log(`Tasa de éxito: ${successRate.toFixed(2)}%`)
    console.log(`Latencia promedio (éxitos): ${avgLatency.toFixed(2)} ms`)
    console.log(`\nArchivos generados:`)
    console.log(`- ${OUTPUT_FILE}`)
    console.log(`- ${SEARCH_LOG}`)
}

runBenchmark().catch(console.error)
