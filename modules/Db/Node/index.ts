import { ClassicLevel } from 'classic-level'
import { DbResponse } from './DbResponse.js';
import path from 'path';

export class NodeDbManager {
    private db: ClassicLevel
    constructor() {
        this.db = new ClassicLevel(path.resolve(".db"), { valueEncoding: 'json' })
    }
    public async initDb() {
        await this.db.open();
    }
    public getDb() {
        return this.db;
    }
    public async saveContent(hash: string, data: any): Promise<DbResponse> {
        try {
            await this.db.put(hash, JSON.stringify(data))
            return {
                error: false,
                message: "Content Saved"
            }
        } catch (error) {
            return {
                error: true,
                message: error
            }
        }
    }
    public async getContent(hash: string): Promise<DbResponse> {
        try {
            const data = await this.db.get(hash);
            const json = JSON.parse(data);
            return {
                message: "Content Consultated",
                error: false,
                data: json
            }
        } catch (error) {
            console.log(error);
            return {
                error: true,
                message: error
            }
        }
    }
}