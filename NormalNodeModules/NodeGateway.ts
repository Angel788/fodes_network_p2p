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
    //init Sockets
    initSocket() {
        this.socket.on("connection", (socket: Socket) => {
            // Conectar al Boostrap o reconectar a el
            socket.on("ui:contact_boostrap", async (dirLibP2PNodeBoostrap: string, callBack: (res: ContetResponse) => void) => {
                await this.contactBoostrap(dirLibP2PNodeBoostrap, callBack)
            })

            // Obtener publicaciones atravez de sockets con su CID
            socket.on("ui:get_publication", async (cidPublication: string, callBack: (res: ContetResponse) => void) => {
                await this.getPublication(cidPublication, callBack);
            })

            // Obtener publicaciones atravez de sockets con su CID
            socket.on("ui:get_comment", async (cidComment: string, callBack: (res: ContetResponse) => void) => {
                await this.getComment(cidComment, callBack);
            })

            //Guardar un post
            socket.on("ui:post_publication", async (cidPublication: string, data: JSON, callBack: (res: ContetResponse) => void) => {
                await this.postPublication(cidPublication, data, callBack);
            })

            //Guardar un comentario 
            socket.on("ui:post_comment", async (cidComment: string, data: JSON, callBack: (res: ContetResponse) => void) => {
                await this.postComment(cidComment, data, callBack);
            })
            socket.on("ui:replicate_publication", async (cidPublication: string, data: JSON, callBack: (res: ContetResponse) => void) => {
                await this.replicatePublication(cidPublication, data, callBack);
            })
            socket.on("ui:replicate_comment", async (cidComment: string, data: JSON, callBack: (res: ContetResponse) => void) => {
                await this.repiclateComment(cidComment, data, callBack);
            })
        })
    }
    //postContent
    private async postContent(cidContent: string, data: JSON, callBack: (res: ContetResponse) => void) {
        try {
            await this.normalNode.saveContent(cidContent, data);
            callBack({
                success: true,
                cid_content: cidContent,
                data: data
            })
        } catch (errorPost) {
            callBack({
                success: false,
                error: errorPost
            })
        }
    }

    //postComment
    private async postComment(cidComment: string, data: JSON, callBack: (res: ContetResponse) => void) {
        await this.postContent(cidComment, data, callBack);
    }

    //postPublication
    private async postPublication(cidPublication: string, data: JSON, callBack: (res: ContetResponse) => void) {
        await this.postContent(cidPublication, data, callBack);
    }

    private async getContent(targetCID: string, protocol: string, callBack: (res: ContetResponse) => void) {
        try {
            const content = await this.normalNode.getContent(targetCID, protocol);
            console.log(content)
            console.log("--")
            callBack({
                success: (content ? true : false),
                data: content
            })
        } catch (errorContent) {
            callBack({
                success: false,
                error: errorContent
            })
        }
    }

    private async getPublication(targetCID: string, callBack: (res: ContetResponse) => void) {
        await this.getContent(targetCID, "/forum/posts/1.0.0", callBack);
    }

    private async getComment(targetCID: string, callBack: (res: ContetResponse) => void) {
        await this.getContent(targetCID, "/forum/comments/1.0.0", callBack);
    }

    private async contactBoostrap(dirLibP2PNodeBoostrap: string, callBack: (res: ContetResponse) => void) {
        try {
            await this.normalNode.contact(dirLibP2PNodeBoostrap);
            callBack({
                success: true
            })
        }
        catch (errorConection) {
            callBack({
                success: false,
                error: errorConection
            })
        }
    }
    //TODO: replicateContet
    private async replicateContent(cidContent: string, data: JSON, callBack: (res: ContetResponse) => void) {
        try {
            this.normalNode.replicate(cidContent, data);
            callBack({
                success: true,
                cid_content: cidContent,
                data: data
            })
        } catch (errorPost) {
            callBack({
                success: false,
                error: errorPost
            })
        }
    }
    private async replicatePublication(cidPublication: string, data: JSON, callBack: (res: ContetResponse) => void) {
        await this.replicateContent(cidPublication, data, callBack);
    }
    private async repiclateComment(cidComment: string, data: JSON, callBack: (res: ContetResponse) => void) {
        await this.replicateContent(cidComment, data, callBack);
    }
}