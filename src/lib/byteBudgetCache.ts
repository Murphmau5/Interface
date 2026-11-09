/**
 * 按字节预算淘汰的 LRU 缓存。
 * 缩略图这类「单条不大、条数多」的缓存用字节预算比张数上限更贴近真实内存。
 */
export interface ByteBudgetCache<T> {
  get(key: string): T | undefined;
  set(key: string, value: T, bytes: number): void;
  has(key: string): boolean;
  readonly usedBytes: number;
  readonly size: number;
  clear(): void;
}

export function createByteBudgetCache<T>(budgetBytes: number): ByteBudgetCache<T> {
  const entries = new Map<string, { value: T; bytes: number }>();
  let usedBytes = 0;

  const remove = (key: string) => {
    const entry = entries.get(key);
    if (!entry) return;
    usedBytes -= entry.bytes;
    entries.delete(key);
  };

  return {
    get(key) {
      const entry = entries.get(key);
      if (!entry) return undefined;
      // 命中后移到队尾，保持 LRU 顺序
      entries.delete(key);
      entries.set(key, entry);
      return entry.value;
    },
    set(key, value, bytes) {
      remove(key);
      const actual = Math.max(1, Math.round(bytes));
      entries.set(key, { value, bytes: actual });
      usedBytes += actual;

      while (usedBytes > budgetBytes && entries.size > 1) {
        const oldest = entries.keys().next().value;
        if (oldest === undefined) break;
        remove(oldest);
      }
    },
    has(key) {
      return entries.has(key);
    },
    get usedBytes() {
      return usedBytes;
    },
    get size() {
      return entries.size;
    },
    clear() {
      entries.clear();
      usedBytes = 0;
    },
  };
}

/** 缩略图缓存：200MB 字节预算，按 data URI 的 UTF-16 长度估算 */
export function createPosterCache(budgetBytes = 200 * 1024 * 1024) {
  return createByteBudgetCache<string>(budgetBytes);
}
