import { WebSocketServer, type WebSocket } from "ws";

type Pending = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

export class PluginHub {
  private pluginSocket: WebSocket | null = null;
  private pending = new Map<string, Pending>();
  private messageQueue: string[] = [];

  constructor(private readonly wss: WebSocketServer) {
    this.wss.on("connection", (socket, req) => {
      if (!req.url?.startsWith("/plugin")) return;
      this.pluginSocket = socket;
      // Flush queued messages
      while (this.messageQueue.length > 0) {
        const msg = this.messageQueue.shift()!;
        socket.send(msg);
      }
      socket.on("message", (data) => {
        try {
          const parsed = JSON.parse(data.toString("utf8")) as { requestId?: string };
          const requestId = parsed.requestId;
          if (!requestId) return;
          const pending = this.pending.get(requestId);
          if (!pending) return;
          clearTimeout(pending.timer);
          this.pending.delete(requestId);
          pending.resolve(parsed);
        } catch { /* ignore malformed */ }
      });
      socket.on("close", () => {
        if (this.pluginSocket === socket) this.pluginSocket = null;
      });
    });
  }

  hasPlugin(): boolean {
    return Boolean(this.pluginSocket && this.pluginSocket.readyState === 1);
  }

  sendAndWait<TRes>(payload: { requestId: string } & Record<string, unknown>, timeoutMs = 15000): Promise<TRes> {
    const json = JSON.stringify(payload);
    if (!this.hasPlugin()) {
      throw new Error("No Figma plugin connected. Open the plugin in Figma first.");
    }
    return new Promise<TRes>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(payload.requestId);
        reject(new Error("Plugin response timeout"));
      }, timeoutMs);
      this.pending.set(payload.requestId, {
        resolve: (value) => resolve(value as TRes),
        reject,
        timer,
      });
      this.pluginSocket!.send(json);
    });
  }
}
