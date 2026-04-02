export async function getPublicIP(): Promise<string> {
    try {
        const gcpUrl = 'http://metadata.google.internal/computeMetadata/v1/instance/network-interfaces/0/access-configs/0/external-ip';
        const response = await fetch(gcpUrl, {
            headers: { 'Metadata-Flavor': 'Google' },
            signal: AbortSignal.timeout(2000)
        });
        console.log(response)
        if (response.ok) {
            const ip = await response.text();
            return ip.trim();
        }
    } catch (error) {
        console.log('No se detectó el entorno de GCP. Usando servicio de respaldo...');
    }
}