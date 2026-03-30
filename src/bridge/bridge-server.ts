import express from "express";
import { createServer, type Server } from "node:http";
import { WebSocketServer } from "ws";
import { PluginHub } from "./plugin-hub.js";

export interface BridgeConfig {
  port: number;
}

export class BridgeServer {
  readonly app = express();
  readonly http: Server;
  readonly wss: WebSocketServer;
  readonly hub: PluginHub;
  private started = false;
  private _actualPort: number;

  get actualPort(): number {
    return this._actualPort;
  }

  constructor(private readonly config: BridgeConfig) {
    this._actualPort = config.port;
    this.app.use(express.json({ limit: "2mb" }));
    this.http = createServer(this.app);
    this.wss = new WebSocketServer({ server: this.http });
    this.hub = new PluginHub(this.wss);

    this.app.get("/health", (_req, res) => {
      res.json({
        ok: true,
        pluginConnected: this.hub.hasPlugin(),
        uptime: process.uptime(),
      });
    });
  }

  async start(): Promise<void> {
    if (this.started) return;
    const maxRetries = 5;
    let port = this.config.port;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        await this.listenOn(port);
        this._actualPort = port;
        this.started = true;
        console.error(`[bridge] Listening on http://127.0.0.1:${port}`);
        return;
      } catch (err: unknown) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code === "EADDRINUSE" && attempt < maxRetries - 1) {
          console.error(`[bridge] Port ${port} in use, trying ${port + 1}...`);
          port++;
        } else {
          throw err;
        }
      }
    }
  }

  private listenOn(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const onError = (err: Error) => {
        this.http.removeListener("error", onError);
        reject(err);
      };
      this.http.on("error", onError);
      this.http.listen(port, () => {
        this.http.removeListener("error", onError);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    if (!this.started) return;
    return new Promise((resolve, reject) => {
      this.http.close((err) => {
        this.started = false;
        if (err) reject(err);
        else resolve();
      });
    });
  }
}
