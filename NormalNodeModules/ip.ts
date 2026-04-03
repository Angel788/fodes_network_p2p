
export async function getPublicIp(): Promise<string> {
    try {
        const response = await fetch('https://api.ipify.org?format=json');
        const data = await response.json() as { ip: string };
        return data.ip;
    } catch (error) {
        console.error("Error obteniendo la IP:", error);
        return '127.0.0.1';
    }
}
