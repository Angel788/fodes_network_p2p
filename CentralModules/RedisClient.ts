import { createClient, RedisClientType } from 'redis';

export class RedisClient {
    private static instance: RedisClient;
    private client: RedisClientType;

    private constructor() {
        this.client = createClient({
            url: 'redis://localhost:6379'
        });
        this.client.on('error', (err) => console.error('Redis Client Error', err));
        this.client.on('connect', () => console.log('Redis conectado'));
    }

    public static async getInstance(): Promise<RedisClient> {
        if (!RedisClient.instance) {
            RedisClient.instance = new RedisClient();
            await RedisClient.instance.client.connect();
        }
        return RedisClient.instance;
    }

    public async set(key: string, value: string, ttl: number = 3600): Promise<void> {
        await this.client.set(key, value);
    }

    public async get(key: string): Promise<string | null> {
        const query = await this.client.get(key);
        return typeof query === 'string' ? query : null;
    }
}