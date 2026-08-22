import { describe, expect, it } from "vitest";
import { AsyncTtlCache } from "./async-ttl";

describe("비동기 TTL 캐시", () => {
  it("TTL 동안 같은 비동기 결과를 공유하고 만료 후 다시 불러온다", async () => {
    let now = 1_000;
    let loads = 0;
    const cache = new AsyncTtlCache<string, number>(4, () => now);
    const load = async () => {
      loads += 1;
      return loads;
    };

    await expect(cache.get("key", 100, load)).resolves.toBe(1);
    await expect(cache.get("key", 100, load)).resolves.toBe(1);
    expect(loads).toBe(1);

    now = 1_100;
    await expect(cache.get("key", 100, load)).resolves.toBe(2);
  });

  it("실패한 요청은 성공값처럼 캐시하지 않는다", async () => {
    const cache = new AsyncTtlCache<string, string>(4);
    await expect(
      cache.get("key", 100, async () => {
        throw new Error("API failure");
      }),
    ).rejects.toThrow("API failure");

    await expect(
      cache.get("key", 100, async () => "recovered"),
    ).resolves.toBe("recovered");
  });

  it("최대 항목 수를 넘으면 가장 오래된 항목을 제거한다", async () => {
    let firstLoads = 0;
    const cache = new AsyncTtlCache<string, string>(2);

    await cache.get("first", 1_000, async () => {
      firstLoads += 1;
      return "first";
    });
    await cache.get("second", 1_000, async () => "second");
    await cache.get("third", 1_000, async () => "third");
    await cache.get("first", 1_000, async () => {
      firstLoads += 1;
      return "first";
    });

    expect(firstLoads).toBe(2);
  });
});
