export async function getPublicIP(): Promise<string> {
    // Intento 1: metadata de GCP
    try {
        const gcpUrl = 'http://metadata.google.internal/computeMetadata/v1/instance/network-interfaces/0/access-configs/0/external-ip';
        const response = await fetch(gcpUrl, {
            headers: { 'Metadata-Flavor': 'Google' },
            signal: AbortSignal.timeout(2000)
        });
        if (response.ok) {
            const ip = await response.text();
            console.log('[GCP] IPv4 pública detectada:', ip.trim());
            return ip.trim();
        }
    } catch {
        console.log('[GCP] No se detectó entorno GCP. Usando servicio de respaldo...');
    }

    // Intento 2: servicio externo de respaldo
    try {
        const res = await fetch('https://api4.my-ip.io/ip', { signal: AbortSignal.timeout(3000) });
        if (res.ok) {
            const ip = await res.text();
            console.log('[Fallback] IPv4 pública detectada:', ip.trim());
            return ip.trim();
        }
    } catch {
        console.log('[Fallback] No se pudo obtener IP pública externa.');
    }

    throw new Error('No se pudo obtener la IP pública. Verifica la conectividad del servidor.');
}

export async function getPublicIPv6(): Promise<string | null> {
    // Intento 1: metadata de GCP (IPv6 externa si está habilitada en la instancia)
    try {
        const gcpUrl = 'http://metadata.google.internal/computeMetadata/v1/instance/network-interfaces/0/ipv6s';
        const response = await fetch(gcpUrl, {
            headers: { 'Metadata-Flavor': 'Google' },
            signal: AbortSignal.timeout(2000)
        });
        if (response.ok) {
            const ip = await response.text();
            const cleaned = ip.trim();
            if (cleaned) {
                console.log('[GCP] IPv6 detectada:', cleaned);
                return cleaned;
            }
        }
    } catch {
        // GCP no disponible o sin IPv6 configurado
    }

    console.log('[GCP] No hay IPv6 disponible en esta instancia.');
    return null;
}