import { ClassicLevel } from 'classic-level'
import { DbResponse } from './DbResponse.js';
import path from 'path';
import { rm } from 'fs/promises';

export class NodeDbManager {
    private db: ClassicLevel
    private dbPath: string
    constructor(dbPath?: string) {
        // En producción (AppImage/exe) el cwd es de solo lectura.
        // Usamos GATEWAY_USER_DATA (inyectado por Electron) para guardar en una ruta escribible.
        const resolvedPath = dbPath
            ?? (process.env.GATEWAY_USER_DATA
                ? path.join(process.env.GATEWAY_USER_DATA, '.db')
                : '.db')
        this.dbPath = path.resolve(resolvedPath)
        this.db = new ClassicLevel(this.dbPath, { valueEncoding: 'json' })
    }
    public async initDb() {
        try {
            await this.db.open();
        } catch (err: any) {
            const msg = String(err?.message ?? err)
            const esLock = msg.includes('LOCK') || msg.includes('lock') ||
                           err?.code === 'LEVEL_LOCKED' || err?.code === 'LEVEL_DATABASE_NOT_OPEN'
            if (esLock) {
                console.log('[DB] LOCK detectado de sesión anterior — intentando recuperar...')
                try {
                    await rm(path.join(this.dbPath, 'LOCK'), { force: true })
                    // Recrear instancia porque la anterior quedó en estado inválido
                    this.db = new ClassicLevel(this.dbPath, { valueEncoding: 'json' })
                    await this.db.open()
                    console.log('[DB] Recuperación exitosa')
                } catch (e) {
                    console.error('[DB] No se pudo recuperar la base de datos:', e)
                    throw e
                }
            } else {
                throw err
            }
        }
    }
    public getDb() {
        return this.db;
    }
    public async saveContent(hash: string, data: JSON): Promise<DbResponse> {
        if (!data) return { error: true, message: 'No data provided' }
        try {
            await this.db.put(hash, JSON.stringify(data))
            return { error: false, message: "Content Saved" }
        } catch (error) {
            return { error: true, message: error }
        }
    }
    public async getContent(hash: string): Promise<DbResponse> {
        try {
            const raw = await this.db.get(hash)
            // saveContent stores JSON.stringify(data) so LevelDB has a double-encoded string
            const json = typeof raw === 'string' ? JSON.parse(raw) : raw
            return { message: "Content Consultated", error: false, data: json }
        } catch {
            return { error: true, message: 'Not found' }
        }
    }

    public async close(): Promise<void> {
        await this.db.close()
    }

    // ── Comment index: idx:comments:${cid} → string[] ──────────
    public async getCommentIndex(publicationCid: string): Promise<string[]> {
        try {
            const val = await this.db.get(`idx:comments:${publicationCid}`)
            // stored as native JSON array by LevelDB
            if (Array.isArray(val)) return val as unknown as string[]
            if (typeof val === 'string') return JSON.parse(val)
            return []
        } catch {
            return []
        }
    }

    public async addCommentToIndex(publicationCid: string, commentCid: string): Promise<void> {
        const existing = await this.getCommentIndex(publicationCid)
        if (!existing.includes(commentCid)) {
            existing.push(commentCid)
            await this.db.put(`idx:comments:${publicationCid}`, JSON.stringify(existing))
        }
    }

    // ── Votes: votes:${cid} → { [userId]: 1 | -1 } ────────────
    public async getVotes(cid: string): Promise<Record<string, number>> {
        try {
            const val = await this.db.get(`votes:${cid}`)
            // valueEncoding:'json' devuelve el valor ya parseado si fue guardado como objeto,
            // o una cadena si fue guardado con JSON.stringify manual — manejar ambos casos.
            if (val && typeof val === 'object') return val as unknown as Record<string, number>
            if (typeof val === 'string') return JSON.parse(val)
            return {}
        } catch {
            return {}
        }
    }

    public async setVote(cid: string, userId: string, dir: number): Promise<void> {
        const votes = await this.getVotes(cid)
        if (dir === 0) delete votes[userId]
        else votes[userId] = dir
        await this.db.put(`votes:${cid}`, JSON.stringify(votes))
    }

    public async mergeVotes(cid: string, incoming: Record<string, number>): Promise<void> {
        const local = await this.getVotes(cid)
        await this.db.put(`votes:${cid}`, JSON.stringify({ ...local, ...incoming }))
    }

    public async getVoteTotal(cid: string): Promise<number> {
        const votes = await this.getVotes(cid)
        return Object.values(votes).reduce((sum, v) => sum + v, 0)
    }

    // ── All vote keys for bulk sync ─────────────────────────────
    public async getAllVoteEntries(): Promise<Array<{ cid: string; votes: Record<string, number> }>> {
        const result: Array<{ cid: string; votes: Record<string, number> }> = []
        try {
            for await (const [key, value] of this.db.iterator()) {
                if (!key.startsWith('votes:')) continue
                try {
                    const votes = (value && typeof value === 'object')
                        ? value as unknown as Record<string, number>
                        : JSON.parse(value as unknown as string)
                    result.push({ cid: key.slice(6), votes })
                } catch {}
            }
        } catch {}
        return result
    }

    // ── Comment index keys for bulk sync ───────────────────────
    public async getAllCommentIndexEntries(): Promise<Array<{ parentCid: string; commentCids: string[] }>> {
        const result: Array<{ parentCid: string; commentCids: string[] }> = []
        try {
            for await (const [key, value] of this.db.iterator()) {
                if (!key.startsWith('idx:comments:')) continue
                try {
                    const commentCids = Array.isArray(value)
                        ? value as unknown as string[]
                        : JSON.parse(value as unknown as string)
                    result.push({ parentCid: key.slice(13), commentCids })
                } catch {}
            }
        } catch {}
        return result
    }
}
