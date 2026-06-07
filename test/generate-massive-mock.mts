import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { CID } from 'multiformats/cid'
import * as json from '@ipld/dag-json'
import { sha256 } from 'multiformats/hashes/sha2'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const COUNT = parseInt(process.argv[2]) || 1000
const OUTPUT_FILE = path.join(__dirname, `mock_publications.json`)

async function generateMockData() {
    console.log(`Generating ${COUNT} mock publications...`)

    const publications = []

    for (let i = 0; i < COUNT; i++) {
        const payload = {
            title: `Publicación de prueba #${i}`,
            content: `Este es el contenido detallado de la publicación número ${i}. Generada para pruebas de carga masiva.`,
            author: `User_${Math.floor(Math.random() * 1000)}`,
            timestamp: new Date().toISOString(),
            tags: ['test', 'massive', 'p2p']
        }

        // Generar un CID determinista pero único para cada objeto
        const bytes = new TextEncoder().encode(JSON.stringify(payload) + i)
        const hash = await sha256.digest(bytes)
        const cid = CID.createV1(json.code, hash)

        publications.push({
            cid_content: cid.toString(),
            ...payload
        })

        if (i % 100 === 0) console.log(`   > Progreso: ${i}/${COUNT}`)
    }

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(publications, null, 2))
    console.log(`✅ Archivo generado exitosamente: ${OUTPUT_FILE}`)
    console.log(`💡 Para usar este archivo en el massive-runner, asegúrate de actualizar la ruta del import en 'test/massive-runner.mts' o renombrarlo.`)
}

generateMockData().catch(console.error)
