
import { networkInterfaces } from 'os';

export function getLocalIPv6(): string | null {
    const nets = networkInterfaces();
    for (const interfaces of Object.values(nets)) {
        for (const net of interfaces ?? []) {
            // Filtra loopback y link-local (fe80::)
            if (net.family === 'IPv6' && !net.internal && !net.address.startsWith('fe80')) {
                return net.address;
            }
        }
    }
    return null;
}

