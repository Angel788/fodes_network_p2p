import { NormalNode } from "../modules/Node/NormalNode.js"
import { Server, Socket } from "socket.io";
import { ContetResponse } from "./Responses.js";

export class NodeGateway {
    private normalNode: NormalNode;
    private socket: Server
    constructor(normalNode: NormalNode, port = 3031,) {
        this.normalNode = normalNode;
        this.socket = new Server(port, {
            cors: { origin: "*" }
        })
        this.initSocket();
    }

    initSocket() {
        // Cuando el nodo recibe un CID nuevo de otro peer, lo emite a todos los clientes UI
        this.normalNode.onNewCID((cid: string) => {
            console.log(`[Gateway] Nuevo CID recibido: ${cid}`)
            this.socket.emit('network:new_publication', { cid })
        })

        // Cuando un peer sincroniza votos, notificar a la UI con el total actualizado
        this.normalNode.onVoteUpdate((cid: string, total: number, votesMap: Record<string, number>) => {
            this.socket.emit('mutable:vote_update', { cid, total, votesMap })
        })

        // Cuando llega un índice de comentario de otro peer, notificar a la UI
        this.normalNode.onCommentIndex((parentCid: string, commentCid: string) => {
            this.socket.emit('mutable:comment_index_update', { parentCid, commentCid })
        })

        this.socket.on("connection", (socket: Socket) => {

            // ── Conectar al Bootstrap ───────────────────────────
            socket.on("ui:contact_boostrap", async (dirLibP2PNodeBoostrap: string, callBack: (res: ContetResponse) => void) => {
                await this.contactBoostrap(dirLibP2PNodeBoostrap, callBack)
            })

            // ── Obtener publicación por CID ─────────────────────
            socket.on("ui:get_publication", async (cidPublication: string, callBack: (res: ContetResponse) => void) => {
                await this.getPublication(cidPublication, callBack);
            })

            // ── Obtener comentario por CID ──────────────────────
            socket.on("ui:get_comment", async (cidComment: string, callBack: (res: ContetResponse) => void) => {
                await this.getComment(cidComment, callBack);
            })

            // ── Crear publicación ───────────────────────────────
            socket.on("ui:create_publication", async (data: JSON, callBack: (res: ContetResponse) => void) => {
                await this.createPublication(data, callBack);
            })

            // ── Obtener todos los CIDs locales ──────────────────
            socket.on("ui:get_my_cids", async (callBack: (res: ContetResponse) => void) => {
                await this.getMyCIDs(callBack);
            })

            // ── Guardar publicación por CID ─────────────────────
            socket.on("ui:post_publication", async (cidPublication: string, data: JSON, callBack: (res: ContetResponse) => void) => {
                await this.postPublication(cidPublication, data, callBack);
            })

            // ── Guardar comentario por CID ──────────────────────
            socket.on("ui:post_comment", async (cidComment: string, data: JSON, callBack: (res: ContetResponse) => void) => {
                await this.postComment(cidComment, data, callBack);
            })

            socket.on("ui:replicate_publication", async (cidPublication: string, data: JSON, callBack: (res: ContetResponse) => void) => {
                await this.replicatePublication(cidPublication, data, callBack);
            })
            socket.on("ui:replicate_comment", async (cidComment: string, data: JSON, callBack: (res: ContetResponse) => void) => {
                await this.repiclateComment(cidComment, data, callBack);
            })

            // ── Crear comentario vinculado a una publicación ────
            socket.on("ui:create_comment", async (publicationCid: string, data: JSON, callBack: (res: ContetResponse) => void) => {
                await this.createComment(publicationCid, data, callBack);
            })

            // ── Obtener comentarios de una publicación ──────────
            socket.on("ui:get_publication_comments", async (publicationCid: string, callBack: (res: ContetResponse) => void) => {
                await this.getPublicationComments(publicationCid, callBack);
            })

            // ── Streaming de comentarios (uno por uno conforme llegan) ──
            socket.on("ui:get_publication_comments_stream", async (publicationCid: string) => {
                try {
                    await this.normalNode.streamPublicationComments(publicationCid, (comment) => {
                        socket.emit('comment:stream', { publicationCid, ...comment })
                    })
                } catch { /* noop */ } finally {
                    socket.emit('comment:stream:end', { publicationCid })
                }
            })

            // ── Votar en una publicación o comentario ───────────
            // Fire-and-forget: el resultado viaja por mutable:vote_update
            socket.on("ui:vote", async (data: { cid: string; userId: string; dir: number }) => {
                await this.handleVote(data)
            })

            // ── Obtener total de votos de un CID ────────────────
            socket.on("ui:get_votes", async (cid: string, callBack: (res: ContetResponse) => void) => {
                if (typeof callBack !== 'function') return
                try {
                    const total = await this.normalNode.getDb().getVoteTotal(cid)
                    callBack({ success: true, data: { total } as any })
                } catch (error) {
                    callBack({ success: false, error })
                }
            })
        })
    }

    // ── Vote handler ────────────────────────────────────────────
    private async handleVote(data: { cid: string; userId: string; dir: number }) {
        try {
            const total    = await this.normalNode.vote(data.cid, data.userId, data.dir)
            const votesMap = await this.normalNode.getDb().getVotes(data.cid)
            this.socket.emit('mutable:vote_update', { cid: data.cid, total, votesMap })
        } catch (error) {
            console.log('[Gateway] Error al procesar voto:', error)
        }
    }

    // ── Private helpers ─────────────────────────────────────────
    private async createPublication(data: JSON, callBack: (res: ContetResponse) => void) {
        try {
            const cid = await this.normalNode.createContent(data);
            if (!cid) {
                callBack({ success: false, error: 'No se pudo generar el CID' });
                return;
            }
            callBack({ success: true, cid_content: cid, data });
        } catch (error) {
            callBack({ success: false, error });
        }
    }

    private async getMyCIDs(callBack: (res: ContetResponse) => void) {
        try {
            const cids = await this.normalNode.getAllLocalCIDs();
            callBack({ success: true, data: cids as any });
        } catch (error) {
            callBack({ success: false, error });
        }
    }

    private async postContent(cidContent: string, data: JSON, callBack: (res: ContetResponse) => void) {
        try {
            await this.normalNode.saveContent(cidContent, data);
            callBack({ success: true, cid_content: cidContent, data })
        } catch (errorPost) {
            callBack({ success: false, error: errorPost })
        }
    }

    private async postComment(cidComment: string, data: JSON, callBack: (res: ContetResponse) => void) {
        await this.postContent(cidComment, data, callBack);
    }

    private async postPublication(cidPublication: string, data: JSON, callBack: (res: ContetResponse) => void) {
        await this.postContent(cidPublication, data, callBack);
    }

    private async getPublication(targetCID: string, callBack: (res: ContetResponse) => void) {
        try {
            const content = await this.normalNode.getContent(targetCID, "/forum/posts/1.0.0")
            if (!content) { callBack({ success: false }); return }
            const db = this.normalNode.getDb()
            const votos       = await db.getVoteTotal(targetCID)
            const votesMap    = await db.getVotes(targetCID)
            const comentarios = (await db.getCommentIndex(targetCID)).length
            callBack({ success: true, data: { ...content as object, votos, votesMap, comentarios } as any })
        } catch (error) {
            callBack({ success: false, error })
        }
    }

    private async getComment(targetCID: string, callBack: (res: ContetResponse) => void) {
        try {
            const content = await this.normalNode.getContent(targetCID, "/forum/comments/1.0.0")
            if (!content) { callBack({ success: false }); return }
            const votos = await this.normalNode.getDb().getVoteTotal(targetCID)
            callBack({ success: true, data: { ...content as object, votos } as any })
        } catch (error) {
            callBack({ success: false, error })
        }
    }

    private async contactBoostrap(dirLibP2PNodeBoostrap: string, callBack: (res: ContetResponse) => void) {
        try {
            await this.normalNode.contact(dirLibP2PNodeBoostrap);
            callBack({ success: true })
        }
        catch (errorConection) {
            callBack({ success: false, error: errorConection })
        }
    }

    private async replicateContent(cidContent: string, data: JSON, callBack: (res: ContetResponse) => void) {
        try {
            this.normalNode.replicate(cidContent, data);
            callBack({ success: true, cid_content: cidContent, data })
        } catch (errorPost) {
            callBack({ success: false, error: errorPost })
        }
    }

    private async createComment(publicationCid: string, data: JSON, callBack: (res: ContetResponse) => void) {
        try {
            const cid = await this.normalNode.createComment(publicationCid, data);
            if (!cid) {
                callBack({ success: false, error: 'No se pudo generar el CID del comentario' });
                return;
            }
            callBack({ success: true, cid_content: cid, data });
            // Notificar a la UI el nuevo conteo de comentarios para esa publicación/comentario padre
            const total = (await this.normalNode.getDb().getCommentIndex(publicationCid)).length
            this.socket.emit('mutable:comment_update', { parentCid: publicationCid, total })
        } catch (error) {
            callBack({ success: false, error });
        }
    }

    private async getPublicationComments(publicationCid: string, callBack: (res: ContetResponse) => void) {
        try {
            const comments = await this.normalNode.getPublicationComments(publicationCid);
            callBack({ success: true, data: comments as any });
        } catch (error) {
            callBack({ success: false, error });
        }
    }

    private async replicatePublication(cidPublication: string, data: JSON, callBack: (res: ContetResponse) => void) {
        await this.replicateContent(cidPublication, data, callBack);
    }
    private async repiclateComment(cidComment: string, data: JSON, callBack: (res: ContetResponse) => void) {
        await this.replicateContent(cidComment, data, callBack);
    }
}
