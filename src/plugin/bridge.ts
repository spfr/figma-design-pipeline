import { WebSocketServer, WebSocket } from "ws";
import { createServer, type Server } from "node:http";
import { randomUUID } from "node:crypto";

export interface BridgeStatus {
  connected: boolean;
  port: number | null;
  pluginVersion?: string;
  pageName?: string;
  documentName?: string;
  pendingBatches: number;
}

interface PendingBatch {
  resolve: (result: BatchResult) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export interface BatchResult {
  batchId: string;
  dryRun: boolean;
  success: boolean;
  results: Array<{
    actionIndex: number;
    type: string;
    status: "applied" | "planned" | "failed" | "skipped";
    nodeId?: string;
    newNodeId?: string;
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
    error?: string;
  }>;
  nodeIdMap: Record<string, string>;
  summary: { total: number; applied: number; failed: number; skipped: number };
  error?: string;
}

export interface Batch {
  type: "batch";
  batchId: string;
  dryRun: boolean;
  stopOnError: boolean;
  rollbackOnError: boolean;
  requiredFonts: Array<{ family: string; style?: string }>;
  actions: Array<Record<string, unknown>>;
}

export class BridgeServer {
  private httpServer: Server | null = null;
  private wss: WebSocketServer | null = null;
  private plugin: WebSocket | null = null;
  private boundPort: number | null = null;
  private pending = new Map<string, PendingBatch>();
  private pluginInfo: { pluginVersion?: string; pageName?: string; documentName?: string } = {};

  async start(preferredPort = 4010): Promise<number> {
    for (let port = preferredPort; port < preferredPort + 5; port++) {
      try {
        return await this.listen(port);
      } catch {
        continue;
      }
    }
    throw new Error(`Could not bind bridge server on ports ${preferredPort}-${preferredPort + 4}`);
  }

  private listen(port: number): Promise<number> {
    return new Promise((resolve, reject) => {
      const server = createServer((_, res) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, connected: this.isConnected(), port }));
      });

      server.on("error", reject);

      const wss = new WebSocketServer({ server, path: "/plugin" });
      wss.on("error", reject);

      wss.on("connection", (ws) => {
        // Replace existing connection
        if (this.plugin) {
          try { this.plugin.close(); } catch { /* ignore */ }
        }
        this.plugin = ws;
        console.error(`[bridge] Plugin connected on port ${port}`);

        ws.on("message", (raw) => {
          try {
            const data = JSON.parse(raw.toString());
            this.handleMessage(data);
          } catch (err) {
            console.error("[bridge] Bad message:", err);
          }
        });

        ws.on("close", () => {
          if (this.plugin === ws) {
            this.plugin = null;
            this.pluginInfo = {};
            // Reject all in-flight batches immediately
            for (const [id, p] of this.pending) {
              clearTimeout(p.timer);
              p.reject(new Error("Plugin disconnected mid-batch"));
            }
            this.pending.clear();
            console.error("[bridge] Plugin disconnected");
          }
        });
      });

      server.listen(port, "127.0.0.1", () => {
        this.httpServer = server;
        this.wss = wss;
        this.boundPort = port;
        resolve(port);
      });
    });
  }

  private handleMessage(data: Record<string, unknown>): void {
    if (data.type === "handshake") {
      this.pluginInfo = {
        pluginVersion: data.pluginVersion as string,
        pageName: data.pageName as string,
        documentName: data.documentName as string,
      };
      console.error(`[bridge] Handshake: ${this.pluginInfo.documentName} / ${this.pluginInfo.pageName} (plugin v${this.pluginInfo.pluginVersion})`);
      return;
    }

    if (data.type === "batch_result") {
      const batchId = data.batchId as string;
      const pending = this.pending.get(batchId);
      if (pending) {
        clearTimeout(pending.timer);
        this.pending.delete(batchId);
        pending.resolve(data as unknown as BatchResult);
      }
      return;
    }

    if (data.type === "pong") {
      this.pluginInfo.pageName = data.pageName as string;
      return;
    }
  }

  async execute(batch: Omit<Batch, "type" | "batchId">, timeoutMs = 30000): Promise<BatchResult> {
    if (!this.plugin || this.plugin.readyState !== WebSocket.OPEN) {
      throw new Error("Plugin not connected. Open the SPFR Design Pipeline plugin in Figma.");
    }

    const batchId = randomUUID();
    const fullBatch: Batch = { type: "batch", batchId, ...batch };

    return new Promise<BatchResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(batchId);
        reject(new Error(`Batch ${batchId} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pending.set(batchId, { resolve, reject, timer });
      this.plugin!.send(JSON.stringify(fullBatch));
    });
  }

  isConnected(): boolean {
    return this.plugin !== null && this.plugin.readyState === WebSocket.OPEN;
  }

  getStatus(): BridgeStatus {
    return {
      connected: this.isConnected(),
      port: this.boundPort,
      ...this.pluginInfo,
      pendingBatches: this.pending.size,
    };
  }

  async stop(): Promise<void> {
    for (const [, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(new Error("Bridge shutting down"));
    }
    this.pending.clear();
    if (this.plugin) { try { this.plugin.close(); } catch { /* ignore */ } }
    if (this.wss) this.wss.close();
    if (this.httpServer) {
      await new Promise<void>((resolve) => this.httpServer!.close(() => resolve()));
    }
  }
}
