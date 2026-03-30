export class FigmaRestClient {
  private readonly baseUrl = "https://api.figma.com/v1";
  private _defaultFileKey: string | undefined;

  constructor(
    private readonly token: string,
    defaultFileKey?: string
  ) {
    this._defaultFileKey = defaultFileKey;
  }

  get defaultFileKey(): string | undefined {
    return this._defaultFileKey;
  }

  set defaultFileKey(key: string | undefined) {
    this._defaultFileKey = key;
  }

  private resolveFileKey(fileKey?: string): string {
    const key = fileKey || this._defaultFileKey;
    if (!key) {
      throw new Error(
        "No file key provided. Pass a Figma URL or file key with your request."
      );
    }
    return key;
  }

  private async request<T>(path: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        url.searchParams.set(k, v);
      }
    }
    const res = await fetch(url.toString(), {
      headers: { "X-Figma-Token": this.token },
    });
    if (!res.ok) {
      throw new Error(`Figma REST ${res.status}: ${res.statusText} — ${path}`);
    }
    return res.json() as Promise<T>;
  }

  async getFile(opts?: { depth?: number; fileKey?: string }): Promise<unknown> {
    const fk = this.resolveFileKey(opts?.fileKey);
    const p: Record<string, string> = {};
    if (opts?.depth) p.depth = String(opts.depth);
    return this.request(`/files/${fk}`, p);
  }

  async getFileNodes(
    nodeIds: string[],
    opts?: { depth?: number; fileKey?: string }
  ): Promise<unknown> {
    const fk = this.resolveFileKey(opts?.fileKey);
    const p: Record<string, string> = { ids: nodeIds.join(",") };
    if (opts?.depth) p.depth = String(opts.depth);
    return this.request(`/files/${fk}/nodes`, p);
  }

  async getImages(
    nodeIds: string[],
    format: "png" | "svg" | "jpg" | "pdf" = "png",
    scale = 2,
    fileKey?: string
  ): Promise<Record<string, string>> {
    const fk = this.resolveFileKey(fileKey);
    const data = await this.request<{ images: Record<string, string> }>(
      `/images/${fk}`,
      { ids: nodeIds.join(","), format, scale: String(scale) }
    );
    return data.images;
  }

  async getFileStyles(fileKey?: string): Promise<unknown> {
    const fk = this.resolveFileKey(fileKey);
    return this.request(`/files/${fk}/styles`);
  }

  async getFileComponents(fileKey?: string): Promise<unknown> {
    const fk = this.resolveFileKey(fileKey);
    return this.request(`/files/${fk}/components`);
  }
}
