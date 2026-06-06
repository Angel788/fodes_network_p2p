# FODES P2P Network

Modular Peer-to-Peer implementation based on Libp2p.

## Node Types

### Central Node
Acts as a bootstrap node and relay server.
```bash
npm run server
```

### Normal Node
Regular peer that contributes storage and replication.
```bash
npm run normal
```

## Security
Uses a Pre-Shared Key (PSK) for private network isolation. The key is stored in `swarm.key`.

## Protocols
- `/forum/posts/1.0.0`: Publication delivery.
- `/forum/comments/1.0.0`: Comment delivery.
- `/forum/replication/1.0.0`: Data redundancy across peers.
- `/fodes`: Kademlia DHT for content routing.
