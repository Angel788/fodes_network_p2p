import { ClassicLevel } from 'classic-level'
import { DbResponse } from './DbResponse.js';
import path from 'path';

export class NodeDbManager {
    private db: ClassicLevel
    constructor() {
        const dbPath = process.env.GATEWAY_USER_DATA || ".db";
        console.log(`[DbManager] Initializing database at: ${path.resolve(dbPath)}`);
        this.db = new ClassicLevel(path.resolve(dbPath), { valueEncoding: 'json' })
    }
    public async initDb() {
        await this.db.open();
    }
    public async close() {
        await this.db.close();
    }
    public getDb() {
        return this.db;
    }
    public async saveContent(hash: string, data: any): Promise<DbResponse> {
        try {
            const serialized = JSON.stringify(data)
            if (!serialized || serialized === 'undefined') {
                return { error: true, message: 'Data no serializable' }
            }
            await this.db.put(hash, serialized)
            return { error: false, message: "Content Saved" }
        } catch (error) {
            return { error: true, message: error }
        }
    }
    public async getContent(hash: string): Promise<DbResponse> {
        try {
            const raw = await this.db.get(hash)
            const str = typeof raw === 'string' ? raw : JSON.stringify(raw)
            if (!str || str === 'undefined' || str === 'null') {
                return { error: true, message: 'Entrada vacía' }
            }
            const json = JSON.parse(str)
            return { message: "Content Consultated", error: false, data: json }
        } catch {
            return { error: true, message: 'Not found' }
        }
    }
}