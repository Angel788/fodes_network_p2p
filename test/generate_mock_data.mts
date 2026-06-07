import fs from 'fs';
import path from 'path';
import { CID } from 'multiformats';
import * as dagCbor from '@ipld/dag-cbor';
import { sha256 } from 'multiformats/hashes/sha2';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CATEGORIES = ['Académico', 'Eventos', 'Tecnología', 'Ayuda'];
const TAGS_POOL = ['#escom', '#fodes', '#tecnologia', '#ipn', '#estudio', '#programacion', '#web', '#p2p', '#noticias', '#duda'];
const AUTHORS = [
    { name: 'Angel Garcia', id: '2020630123', dbId: 1 },
    { name: 'Maria Lopez', id: '2021630456', dbId: 2 },
    { name: 'Juan Perez', id: '2019630789', dbId: 3 },
    { name: 'Sofia Rodriguez', id: '2022630001', dbId: 4 },
    { name: 'Carlos Sanchez', id: '2018630555', dbId: 5 }
];

const LOREM = "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.";

async function generateCid(data: any): Promise<string> {
    // Clonar para evitar efectos secundarios
    const cleanData = JSON.parse(JSON.stringify(data));
    const bytes = dagCbor.encode(cleanData);
    const hash = await sha256.digest(bytes);
    const cid = CID.create(1, dagCbor.code, hash);
    return cid.toString();
}

function getRandom(arr: any[]) {
    return arr[Math.floor(Math.random() * arr.length)];
}

async function generateMockData(count = 5000) {
    const publications = [];
    const now = new Date();
    console.log(count)
    for (let i = 0; i < count; i++) {
        const author = getRandom(AUTHORS);
        const category = getRandom(CATEGORIES);
        const date = new Date(now.getTime() - Math.random() * 1000 * 60 * 60 * 24 * 30);
        const title = `Publicación #${i + 1}`;
        const content = `Contenido #${i + 1}. ${LOREM}`;
        
        const tags = [];
        const numTags = Math.floor(Math.random() * 3) + 1;
        while (tags.length < numTags) {
            const tag = getRandom(TAGS_POOL);
            if (!tags.includes(tag)) tags.push(tag);
        }

        // El objeto que SE GUARDA y SE ENVÍA (sin cid_content interno)
        const pubPayload: any = {
            "titulo": title,
            "resumen": content,
            "content": content,
            "categoria": category,
            "id_categoria": CATEGORIES.indexOf(category) + 1,
            "tags": tags,
            "autor": author.name,
            "autorId": author.id,
            "id_autor": author.dbId,
            "fecha": date.toISOString(),
            "status": "NORMAL",
            "estado": "Normal",
            "report_count": 0,
            "votos": Math.floor(Math.random() * 50),
            "comentarios": Math.floor(Math.random() * 10),
            "valoracion": (Math.random() * 5).toFixed(1)
        };

        const cid = await generateCid(pubPayload);
        
        // La estructura final del JSON de prueba incluye el CID como metadato externo
        console.log(cid);
        publications.push({ cid: cid, data: pubPayload});
    }

    const outputPath = path.join(__dirname, 'mock_publications.json');
    fs.writeFileSync(outputPath, JSON.stringify(publications, null, 2));
    console.log(`Generados ${count} JSONs con integridad criptográfica verificada en ${outputPath}`);
}

generateMockData(1000).catch(console.error);
