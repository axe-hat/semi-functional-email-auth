import { MemoryTtlStore } from "../src/store.js";

describe("MemoryTtlStore", () => {
  it("stores values until they expire", async () => {
    let now = 1_000;
    const store = new MemoryTtlStore<string>(() => now);
    expect(await store.add("a", "one", 500)).toBe(true);
    expect(await store.get("a")).toBe("one");
    now += 499;
    expect(await store.get("a")).toBe("one");
    now += 1;
    expect(await store.get("a")).toBeUndefined();
  });

  it("add() only claims free keys", async () => {
    const store = new MemoryTtlStore();
    expect(await store.add("k", true, 1000)).toBe(true);
    expect(await store.add("k", true, 1000)).toBe(false);
    await store.delete("k");
    expect(await store.add("k", true, 1000)).toBe(true);
  });

  it("take() reads a value once", async () => {
    const store = new MemoryTtlStore<number>();
    await store.add("c", 42, 1000);
    expect(await store.take("c")).toBe(42);
    expect(await store.take("c")).toBeUndefined();
  });

  it("sweeps expired entries and refuses to grow past its limit", async () => {
    let now = 0;
    const store = new MemoryTtlStore(() => now, 2);
    await store.add("a", true, 10);
    await store.add("b", true, 10);
    await expect(store.add("c", true, 10)).rejects.toThrow(/full/);
    now = 120_000;
    expect(await store.add("c", true, 10)).toBe(true);
    expect(store.size).toBe(1);
  });
});
