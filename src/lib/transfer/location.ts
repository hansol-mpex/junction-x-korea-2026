import type { ResolvedLocation } from "./schemas";

interface KakaoAddressDocument {
  address_name?: string;
  x?: string;
  y?: string;
  road_address?: {
    address_name?: string;
  } | null;
}

interface KakaoKeywordDocument {
  place_name?: string;
  address_name?: string;
  road_address_name?: string;
  x?: string;
  y?: string;
}

interface KakaoSearchResponse<T> {
  documents?: T[];
}

interface NominatimDocument {
  display_name?: string;
  name?: string;
  lat?: string;
  lon?: string;
}

const provinceNames: Record<string, string> = {
  서울: "서울특별시",
  부산: "부산광역시",
  대구: "대구광역시",
  인천: "인천광역시",
  광주: "광주광역시",
  대전: "대전광역시",
  울산: "울산광역시",
  세종: "세종특별자치시",
  경기: "경기도",
  강원: "강원특별자치도",
  충북: "충청북도",
  충남: "충청남도",
  전북: "전북특별자치도",
  전남: "전라남도",
  경북: "경상북도",
  경남: "경상남도",
  제주: "제주특별자치도",
};

export function normalizeKoreanRoadAddress(query: string) {
  const normalized = query.trim().replace(/\s+/g, " ");
  const [province, ...remainder] = normalized.split(" ");
  return [provinceNames[province] ?? province, ...remainder].join(" ");
}

async function kakaoSearch<T>({
  endpoint,
  query,
  apiKey,
}: {
  endpoint: "address" | "keyword";
  query: string;
  apiKey: string;
}): Promise<T[]> {
  const params = new URLSearchParams({ query });
  const response = await fetch(
    `https://dapi.kakao.com/v2/local/search/${endpoint}.json?${params}`,
    {
      headers: { Authorization: `KakaoAK ${apiKey}` },
      signal: AbortSignal.timeout(7_000),
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new Error(`Kakao Local HTTP ${response.status}`);
  }

  const payload = (await response.json()) as KakaoSearchResponse<T>;
  return payload.documents ?? [];
}

function coordinate(value: string | undefined, field: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`위치 응답의 ${field} 좌표가 올바르지 않습니다.`);
  }
  return parsed;
}

function supportsFallback(error: unknown) {
  return (
    error instanceof Error &&
    (error.message.startsWith("Kakao Local HTTP ") ||
      error.name === "TimeoutError" ||
      error.name === "AbortError" ||
      error.name === "TypeError")
  );
}

export async function resolveLocation({
  query,
  apiKey,
}: {
  query: string;
  apiKey: string;
}): Promise<ResolvedLocation> {
  const searchQuery = normalizeKoreanRoadAddress(query);
  try {
    const addressMatches = await kakaoSearch<KakaoAddressDocument>({
      endpoint: "address",
      query: searchQuery,
      apiKey,
    });
    const address = addressMatches[0];

    if (address) {
      return {
        query,
        name: query,
        address:
          address.road_address?.address_name || address.address_name || query,
        lat: coordinate(address.y, "위도"),
        lng: coordinate(address.x, "경도"),
        provider: "KAKAO",
      };
    }

    const keywordMatches = await kakaoSearch<KakaoKeywordDocument>({
      endpoint: "keyword",
      query: searchQuery,
      apiKey,
    });
    const place = keywordMatches[0];
    if (place) {
      return {
        query,
        name: place.place_name || query,
        address: place.road_address_name || place.address_name || query,
        lat: coordinate(place.y, "위도"),
        lng: coordinate(place.x, "경도"),
        provider: "KAKAO",
      };
    }
  } catch (error) {
    if (!supportsFallback(error)) throw error;
  }

  const params = new URLSearchParams({
    q: searchQuery,
    format: "jsonv2",
    limit: "1",
    countrycodes: "kr",
  });
  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?${params}`,
    {
      headers: {
        Accept: "application/json",
        "User-Agent": "Guhaejo-Hackathon/0.1",
      },
      signal: AbortSignal.timeout(7_000),
      cache: "no-store",
    },
  );
  if (!response.ok) {
    throw new Error(
      `주소 좌표를 확인하지 못했습니다. 보조 위치 서비스 HTTP ${response.status}`,
    );
  }
  const documents = (await response.json()) as NominatimDocument[];
  const place = documents[0];
  if (!place) {
    throw new Error(`선택한 주소의 좌표를 찾지 못했습니다: ${query}`);
  }

  return {
    query,
    name: place.name || query,
    address: place.display_name || query,
    lat: coordinate(place.lat, "위도"),
    lng: coordinate(place.lon, "경도"),
    provider: "OPENSTREETMAP",
  };
}
