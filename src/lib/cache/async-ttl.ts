interface CacheEntry<T> {
  expiresAt: number;
  promise: Promise<T>;
}

export class AsyncTtlCache<K, T> {
  private readonly entries = new Map<K, CacheEntry<T>>();

  constructor(
    private readonly maxEntries: number,
    private readonly now: () => number = Date.now,
  ) {
    if (!Number.isInteger(maxEntries) || maxEntries < 1) {
      throw new Error("maxEntries는 1 이상의 정수여야 합니다.");
    }
  }

  get(key: K, ttlMs: number, loader: () => Promise<T>): Promise<T> {
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
      throw new Error("ttlMs는 0보다 커야 합니다.");
    }

    const now = this.now();
    const cached = this.entries.get(key);
    if (cached && cached.expiresAt > now) return cached.promise;
    if (cached) this.entries.delete(key);

    this.prune(now);
    while (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next().value as K | undefined;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }

    const entry: CacheEntry<T> = {
      expiresAt: now + ttlMs,
      promise: Promise.resolve().then(loader),
    };
    entry.promise = entry.promise.catch((error) => {
      if (this.entries.get(key) === entry) this.entries.delete(key);
      throw error;
    });
    this.entries.set(key, entry);
    return entry.promise;
  }

  private prune(now: number) {
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) this.entries.delete(key);
    }
  }
}
