import { AsyncTtlCache } from "@/lib/cache/async-ttl";

interface KakaoDirectionsResponse {
  routes?: Array<{
    result_code?: number;
    summary?: {
      distance?: number;
      duration?: number;
    };
  }>;
}

export interface LiveRouteEstimate {
  distanceKm: number;
  durationMinutes: number;
  mode: "LIVE";
}

const routeCache = new AsyncTtlCache<string, LiveRouteEstimate>(500);
const ROUTE_TTL_MS = 60_000;

export async function getRouteEstimate({
  origin,
  destination,
  apiKey,
}: {
  origin: { lat: number; lng: number };
  destination: { lat: number; lng: number };
  apiKey: string;
}): Promise<LiveRouteEstimate> {
  const cacheKey = [
    origin.lat.toFixed(5),
    origin.lng.toFixed(5),
    destination.lat.toFixed(5),
    destination.lng.toFixed(5),
  ].join(":");

  return routeCache.get(cacheKey, ROUTE_TTL_MS, async () => {
    const query = new URLSearchParams({
      origin: `${origin.lng},${origin.lat}`,
      destination: `${destination.lng},${destination.lat}`,
      priority: "RECOMMEND",
    });

    const response = await fetch(
      `https://apis-navi.kakaomobility.com/v1/directions?${query}`,
      {
        headers: { Authorization: `KakaoAK ${apiKey}` },
        signal: AbortSignal.timeout(7_000),
        cache: "no-store",
      },
    );

    if (!response.ok) {
      throw new Error(`Kakao HTTP ${response.status}`);
    }

    const payload = (await response.json()) as KakaoDirectionsResponse;
    const summary = payload.routes?.[0]?.summary;
    if (
      !summary ||
      typeof summary.distance !== "number" ||
      typeof summary.duration !== "number"
    ) {
      throw new Error("카카오 경로 응답에 거리 또는 시간이 없습니다.");
    }

    return {
      distanceKm: Math.round((summary.distance / 1000) * 10) / 10,
      durationMinutes: Math.round(summary.duration / 60),
      mode: "LIVE",
    };
  });
}
