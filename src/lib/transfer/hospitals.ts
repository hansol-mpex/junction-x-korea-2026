import type {
  RawAcceptance,
  RawHospital,
  RawRealtimeBeds,
} from "@/lib/nemc/client";
import { NemcClient } from "@/lib/nemc/client";
import {
  getHospitalHistory,
  historicalDataSource,
} from "@/lib/history/metrics";
import { getRouteEstimate } from "@/lib/routing/kakao";
import { haversineKm } from "@/lib/routing/haversine";
import {
  treatmentAreaLabels,
  type TreatmentAreaCode,
} from "./catalog";
import type {
  AcceptanceState,
  HospitalCandidate,
  HospitalSearchResponse,
  NormalizedAvailability,
  ResolvedLocation,
  TransferHospital,
} from "./schemas";

export const transferCandidateRegions = [
  "경상북도",
  "대구광역시",
  "울산광역시",
  "강원특별자치도",
  "충청북도",
  "경상남도",
] as const;

const statePriority: Record<AcceptanceState, number> = {
  CONFIRMED: 0,
  VERIFY_REQUIRED: 1,
  REPORTED_UNAVAILABLE: 2,
};

const routeLimits: Record<AcceptanceState, number> = {
  CONFIRMED: 8,
  VERIFY_REQUIRED: 10,
  REPORTED_UNAVAILABLE: 4,
};

export function normalizeNemcAvailability(
  value: string | undefined,
): NormalizedAvailability {
  const normalized = value?.trim().toUpperCase();
  if (normalized === "Y" || normalized === "가능") return "Y";
  if (normalized === "N1") return "N1";
  if (
    normalized === "N" ||
    normalized === "불가" ||
    normalized === "불가능" ||
    normalized === "UNAVAILABLE"
  ) {
    return "N";
  }
  return "UNKNOWN";
}

function numberOrNull(value: string | undefined) {
  if (value === undefined || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function validCoordinate(value: string | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function evaluateTransferHospital(hospital: TransferHospital): {
  state: AcceptanceState;
  reason: string;
} {
  const unavailableTreatments = hospital.treatments.filter(
    (item) => item.normalized === "N" || item.normalized === "N1",
  );
  const unknownTreatments = hospital.treatments.filter(
    (item) => item.normalized === "UNKNOWN",
  );

  if (hospital.gate === "N" || hospital.gate === "N1") {
    return {
      state: "REPORTED_UNAVAILABLE",
      reason: "응급실 수용상태가 불가로 보고됨",
    };
  }
  if (hospital.hvec !== null && hospital.hvec <= 0) {
    return {
      state: "REPORTED_UNAVAILABLE",
      reason: "응급실 가용병상이 없음",
    };
  }
  if (unavailableTreatments.length > 0) {
    return {
      state: "REPORTED_UNAVAILABLE",
      reason: `${unavailableTreatments
        .map((item) => item.label)
        .join(", ")} 불가`,
    };
  }
  if (hospital.gate === "UNKNOWN") {
    return {
      state: "VERIFY_REQUIRED",
      reason: "응급실 수용상태 확인 필요",
    };
  }
  if (hospital.hvec === null) {
    return {
      state: "VERIFY_REQUIRED",
      reason: "응급실 가용병상 확인 필요",
    };
  }
  if (unknownTreatments.length > 0) {
    return {
      state: "VERIFY_REQUIRED",
      reason: `${unknownTreatments
        .map((item) => item.label)
        .join(", ")} 정보미제공`,
    };
  }
  return {
    state: "CONFIRMED",
    reason: "응급실, 가용병상, 선택 치료영역 모두 확인",
  };
}

function joinRegion({
  region,
  hospitals,
  beds,
  acceptance,
  treatmentCodes,
}: {
  region: string;
  hospitals: RawHospital[];
  beds: RawRealtimeBeds[];
  acceptance: RawAcceptance[];
  treatmentCodes: TreatmentAreaCode[];
}): TransferHospital[] {
  const bedsById = new Map(
    beds.filter((item) => item.hpid).map((item) => [item.hpid!, item]),
  );
  const acceptanceById = new Map(
    acceptance
      .filter((item) => item.hpid)
      .map((item) => [item.hpid!, item]),
  );
  const liveIds = new Set([...bedsById.keys(), ...acceptanceById.keys()]);

  return hospitals.flatMap((hospital) => {
    if (!hospital.hpid || !hospital.dutyName || !liveIds.has(hospital.hpid)) {
      return [];
    }
    const lat = validCoordinate(hospital.wgs84Lat);
    const lng = validCoordinate(hospital.wgs84Lon);
    if (lat === null || lng === null) return [];

    const bed = bedsById.get(hospital.hpid);
    const accepted = acceptanceById.get(hospital.hpid);
    const gateRaw = accepted?.MKioskTy28?.trim() || "정보미제공";

    return [
      {
        hpid: hospital.hpid,
        name: hospital.dutyName,
        region,
        address: hospital.dutyAddr || "",
        tier: hospital.dutyEmclsName || "응급의료기관",
        phone: hospital.dutyTel3 || hospital.dutyTel1 || "정보미제공",
        lat,
        lng,
        hvec: numberOrNull(bed?.hvec),
        hvidate: bed?.hvidate || null,
        gateRaw,
        gate: normalizeNemcAvailability(gateRaw),
        treatments: treatmentCodes.map((code) => {
          const raw = accepted?.[code]?.trim() || "정보미제공";
          return {
            code,
            label: treatmentAreaLabels[code],
            raw,
            normalized: normalizeNemcAvailability(raw),
          };
        }),
      },
    ];
  });
}

interface EvaluatedHospital {
  hospital: TransferHospital;
  state: AcceptanceState;
  stateReason: string;
  directDistanceKm: number;
}

export function selectRoutePool(
  hospitals: EvaluatedHospital[],
): EvaluatedHospital[] {
  const selected: EvaluatedHospital[] = [];
  for (const state of [
    "CONFIRMED",
    "VERIFY_REQUIRED",
    "REPORTED_UNAVAILABLE",
  ] as const) {
    selected.push(
      ...hospitals
        .filter((item) => item.state === state)
        .sort(
          (a, b) =>
            a.directDistanceKm - b.directDistanceKm ||
            a.hospital.hpid.localeCompare(b.hospital.hpid),
        )
        .slice(0, routeLimits[state]),
    );
  }
  return selected;
}

export function sortHospitalCandidates(
  candidates: HospitalCandidate[],
): HospitalCandidate[] {
  return [...candidates].sort(
    (a, b) =>
      statePriority[a.state] - statePriority[b.state] ||
      a.route.durationMinutes - b.route.durationMinutes ||
      a.hpid.localeCompare(b.hpid),
  );
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results = new Array<PromiseSettledResult<R>>(values.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < values.length) {
      const index = nextIndex++;
      try {
        results[index] = {
          status: "fulfilled",
          value: await mapper(values[index]),
        };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(concurrency, values.length) },
      () => worker(),
    ),
  );
  return results;
}

export async function searchLiveHospitalCandidates({
  nemcApiKey,
  kakaoApiKey,
  location,
  treatmentCodes,
}: {
  nemcApiKey: string;
  kakaoApiKey: string;
  location: ResolvedLocation;
  treatmentCodes: TreatmentAreaCode[];
}): Promise<HospitalSearchResponse> {
  const client = new NemcClient(nemcApiKey);
  const collected = await Promise.allSettled(
    transferCandidateRegions.map(async (region) => {
      const [hospitals, beds, acceptance] = await Promise.all([
        client.getHospitalList(region),
        client.getRealtimeBeds(region),
        client.getAcceptance(region),
      ]);
      return joinRegion({
        region,
        hospitals,
        beds,
        acceptance,
        treatmentCodes,
      });
    }),
  );

  const warnings: string[] = [];
  const hospitals: TransferHospital[] = [];
  collected.forEach((result, index) => {
    if (result.status === "fulfilled") {
      hospitals.push(...result.value);
    } else {
      warnings.push(
        `${transferCandidateRegions[index]} NEMC 조회 실패: ${
          result.reason instanceof Error
            ? result.reason.message
            : "알 수 없는 오류"
        }`,
      );
    }
  });

  if (hospitals.length === 0) {
    throw new Error(
      warnings.length > 0
        ? warnings.join(" / ")
        : "NEMC에서 병원 데이터를 받지 못했습니다.",
    );
  }

  const evaluated = hospitals.map((hospital) => {
    const evaluation = evaluateTransferHospital(hospital);
    return {
      hospital,
      state: evaluation.state,
      stateReason: evaluation.reason,
      directDistanceKm: haversineKm(
        { lat: location.lat, lng: location.lng },
        { lat: hospital.lat, lng: hospital.lng },
      ),
    };
  });
  const routePool = selectRoutePool(evaluated);
  const routed = await mapWithConcurrency(routePool, 5, async (item) => {
    const route = await getRouteEstimate({
      origin: { lat: location.lat, lng: location.lng },
      destination: { lat: item.hospital.lat, lng: item.hospital.lng },
      apiKey: kakaoApiKey,
    });
    return {
      ...item.hospital,
      state: item.state,
      stateReason: item.stateReason,
      history: getHospitalHistory(item.hospital.hpid, treatmentCodes),
      route,
    };
  });

  const candidates: HospitalCandidate[] = [];
  routed.forEach((result, index) => {
    if (result.status === "fulfilled") {
      candidates.push(result.value);
    } else {
      warnings.push(
        `${routePool[index].hospital.name} 경로 조회 실패: ${
          result.reason instanceof Error
            ? result.reason.message
            : "알 수 없는 오류"
        }`,
      );
    }
  });

  if (candidates.length === 0) {
    throw new Error(
      warnings.length > 0
        ? warnings.join(" / ")
        : "Kakao에서 병원 경로를 받지 못했습니다.",
    );
  }

  return {
    candidates: sortHospitalCandidates(candidates),
    queriedAt: new Date().toISOString(),
    source: {
      nemc: "LIVE",
      routing: "LIVE",
      history: historicalDataSource,
      warnings,
      totalHospitals: hospitals.length,
      routedHospitals: candidates.length,
    },
  };
}
