import type { RouteEstimate } from "@/lib/domain/schemas";
import { estimateRoadRoute, haversineKm } from "./haversine";

interface KakaoDirectionsResponse {
  routes?: Array<{
    result_code?: number;
    summary?: {
      distance?: number;
      duration?: number;
    };
  }>;
}

export async function getRouteEstimate({
  origin,
  destination,
  apiKey,
}: {
  origin: { lat: number; lng: number };
  destination: { lat: number; lng: number };
  apiKey?: string;
}): Promise<{ route: RouteEstimate; warning?: string }> {
  const directDistance = haversineKm(origin, destination);
  if (!apiKey) {
    return {
      route: estimateRoadRoute(directDistance),
      warning: "카카오 경로 키가 없어 직선거리 기반 추정치를 사용했습니다.",
    };
  }

  const query = new URLSearchParams({
    origin: `${origin.lng},${origin.lat}`,
    destination: `${destination.lng},${destination.lat}`,
    priority: "RECOMMEND",
  });

  try {
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
      route: {
        distanceKm: Math.round((summary.distance / 1000) * 10) / 10,
        durationMinutes: Math.round(summary.duration / 60),
        mode: "LIVE",
      },
    };
  } catch (error) {
    return {
      route: estimateRoadRoute(directDistance),
      warning: `카카오 경로 조회 실패로 추정치를 사용했습니다: ${
        error instanceof Error ? error.message : "알 수 없는 오류"
      }`,
    };
  }
}
