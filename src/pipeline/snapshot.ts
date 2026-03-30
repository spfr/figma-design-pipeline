import type { EnrichedNode } from "../shared/types.js";

interface CachedSnapshot {
  nodeId: string;
  tree: EnrichedNode;
  version: number;
  fetchedAt: number;
  ttlMs: number;
  lastAccessed: number;
}

const DEFAULT_TTL = 15 * 60 * 1000; // 15 minutes — designs rarely change mid-session
const MAX_ENTRIES = 30; // LRU eviction threshold

export class SnapshotCache {
  private cache = new Map<string, CachedSnapshot>();
  private currentVersion = 0;

  get version(): number {
    return this.currentVersion;
  }

  set(nodeId: string, tree: EnrichedNode, ttlMs = DEFAULT_TTL): void {
    // LRU eviction — remove oldest-accessed entry if at capacity
    if (this.cache.size >= MAX_ENTRIES && !this.cache.has(nodeId)) {
      let oldestKey: string | null = null;
      let oldestTime = Infinity;
      for (const [key, entry] of this.cache) {
        if (entry.lastAccessed < oldestTime) {
          oldestTime = entry.lastAccessed;
          oldestKey = key;
        }
      }
      if (oldestKey) this.cache.delete(oldestKey);
    }

    const now = Date.now();
    this.cache.set(nodeId, {
      nodeId,
      tree,
      version: this.currentVersion,
      fetchedAt: now,
      ttlMs,
      lastAccessed: now,
    });
  }

  get(nodeId: string): EnrichedNode | null {
    const entry = this.cache.get(nodeId);
    if (!entry) return null;
    if (this.isStale(entry)) {
      this.cache.delete(nodeId);
      return null;
    }
    // Update access time for LRU
    entry.lastAccessed = Date.now();
    return entry.tree;
  }

  /** Invalidate all cached snapshots (call after mutations) */
  invalidateAll(): void {
    this.currentVersion++;
    this.cache.clear();
  }

  /** Invalidate a specific node's cache */
  invalidate(nodeId: string): void {
    this.cache.delete(nodeId);
  }

  private isStale(entry: CachedSnapshot): boolean {
    // Stale if version has advanced (mutations happened)
    if (entry.version < this.currentVersion) return true;
    // Stale if TTL expired
    if (Date.now() - entry.fetchedAt > entry.ttlMs) return true;
    return false;
  }
}
