/**
 * Small key/value store with per-key expiry. The server uses it for state that
 * must outlive a single request: verification URLs already used, revoked
 * sessions and WebAuthn challenges.
 *
 * The default implementation lives in process memory, which is right for one
 * server process. Behind a load balancer, implement this interface on a shared
 * store (e.g. Redis `SET key value PX ttl NX`) and pass it to `createApp`.
 */
export interface TtlStore<V = true> {
  /** Returns the value, or undefined if missing or expired. */
  get(key: string): Promise<V | undefined>;
  /** Stores the value only if the key is free. Returns false if it was taken. */
  add(key: string, value: V, ttlMs: number): Promise<boolean>;
  /** Removes the key and returns its value (read-once), if it was present. */
  take(key: string): Promise<V | undefined>;
  delete(key: string): Promise<void>;
}

export class MemoryTtlStore<V = true> implements TtlStore<V> {
  private readonly entries = new Map<string, { value: V; expiresAt: number }>();
  private lastSweep = 0;

  constructor(
    private readonly now: () => number = Date.now,
    private readonly maxEntries = 100_000,
  ) {}

  async get(key: string): Promise<V | undefined> {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  async add(key: string, value: V, ttlMs: number): Promise<boolean> {
    this.sweep();
    if ((await this.get(key)) !== undefined) return false;
    // Bounded memory: refuse new keys rather than grow without limit.
    if (this.entries.size >= this.maxEntries) throw new Error("TtlStore is full");
    this.entries.set(key, { value, expiresAt: this.now() + ttlMs });
    return true;
  }

  async take(key: string): Promise<V | undefined> {
    const value = await this.get(key);
    this.entries.delete(key);
    return value;
  }

  async delete(key: string): Promise<void> {
    this.entries.delete(key);
  }

  get size(): number {
    return this.entries.size;
  }

  /** Drops expired entries, at most once a minute. */
  private sweep(): void {
    const now = this.now();
    if (now - this.lastSweep < 60_000) return;
    this.lastSweep = now;
    for (const [key, entry] of this.entries) if (entry.expiresAt <= now) this.entries.delete(key);
  }
}
