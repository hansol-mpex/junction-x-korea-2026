import { demoHospitalSnapshots } from "@/data/demo";
import { getServerEnv } from "@/lib/config/env";
import type {
  HospitalSnapshot,
  IncidentInput,
  RecommendationResponse,
} from "@/lib/domain/schemas";
import { rankWithGemini } from "@/lib/ai/gemini";
import { collectLiveHospitals } from "@/lib/nemc/service";
import { getRouteEstimate } from "@/lib/routing/kakao";
import { estimateRoadRoute, haversineKm } from "@/lib/routing/haversine";
import { evaluateCandidate } from "./eligibility";
import {
  deterministicRanking,
  sortCandidatesDeterministically,
} from "./fallback";

function unique(values: string[]) {
  return [...new Set(values)];
}

function createPreliminaryEvaluation(
  hospital: HospitalSnapshot,
  incident: IncidentInput,
) {
  const directDistance = haversineKm(incident.location, hospital);
  return evaluateCandidate({
    hospital,
    route: estimateRoadRoute(directDistance),
    requiredCapabilities: incident.requiredCapabilities,
  });
}

export async function createRecommendation(
  incident: IncidentInput,
): Promise<RecommendationResponse> {
  const env = getServerEnv();
  const warnings: string[] = [];
  let hospitals: HospitalSnapshot[];
  let nemcMode: "LIVE" | "SNAPSHOT";

  if (incident.useDemoData) {
    hospitals = demoHospitalSnapshots;
    nemcMode = "SNAPSHOT";
    warnings.push(
      "합성 병원 스냅샷을 사용 중입니다. 실제 수용 가능 상태가 아닙니다.",
    );
  } else {
    if (!env.NEMC_API_KEY) {
      throw new Error(
        "라이브 조회에는 NEMC_API_KEY가 필요합니다. 데모 스냅샷을 선택해 주세요.",
      );
    }
    const live = await collectLiveHospitals(env.NEMC_API_KEY);
    hospitals = live.hospitals;
    warnings.push(...live.warnings);
    nemcMode = "LIVE";
  }

  const withinRadius = hospitals
    .map((hospital) => ({
      hospital,
      directDistance: haversineKm(incident.location, hospital),
    }))
    .filter((item) => item.directDistance <= 150);

  const preliminary = withinRadius.map(({ hospital }) =>
    createPreliminaryEvaluation(hospital, incident),
  );
  const potentiallyEligible = preliminary
    .filter((item) => item.eligibility !== "INELIGIBLE")
    .sort((a, b) => a.route.distanceKm - b.route.distanceKm)
    .slice(0, 12);
  const nearestIneligible = preliminary
    .filter((item) => item.eligibility === "INELIGIBLE")
    .sort((a, b) => a.route.distanceKm - b.route.distanceKm)
    .slice(0, 3);
  const routeShortlist = [
    ...new Map(
      [...potentiallyEligible, ...nearestIneligible].map((item) => [
        item.hospital.hpid,
        item.hospital,
      ]),
    ).values(),
  ];

  const routed = await Promise.all(
    routeShortlist.map(async (hospital) => {
      const result = await getRouteEstimate({
        origin: incident.location,
        destination: hospital,
        apiKey: env.KAKAO_MOBILITY_REST_KEY,
      });
      if (result.warning) warnings.push(result.warning);
      return evaluateCandidate({
        hospital,
        route: result.route,
        requiredCapabilities: incident.requiredCapabilities,
      });
    }),
  );

  const confirmed = routed.filter(
    (candidate) => candidate.eligibility === "CONFIRMED",
  );
  const verifyRequired = routed.filter(
    (candidate) => candidate.eligibility === "VERIFY_REQUIRED",
  );
  const sortedConfirmed = sortCandidatesDeterministically(confirmed).slice(0, 8);
  const rankingPool =
    sortedConfirmed.length >= 3
      ? sortedConfirmed
      : [
          ...sortedConfirmed,
          ...sortCandidatesDeterministically(verifyRequired).slice(
            0,
            3 - sortedConfirmed.length,
          ),
        ];

  let recommendations = deterministicRanking(rankingPool);
  let rankingMode: "GEMINI" | "DETERMINISTIC" = "DETERMINISTIC";

  if (env.GEMINI_API_KEY && rankingPool.length > 0) {
    try {
      recommendations = await rankWithGemini({
        apiKey: env.GEMINI_API_KEY,
        model: env.GEMINI_MODEL,
        incident,
        candidates: rankingPool,
      });
      rankingMode = "GEMINI";
    } catch (error) {
      warnings.push(
        `Gemini 검증 실패로 결정론 순위를 사용했습니다: ${
          error instanceof Error ? error.message : "알 수 없는 오류"
        }`,
      );
    }
  } else if (!env.GEMINI_API_KEY) {
    warnings.push(
      "GEMINI_API_KEY가 없어 검증 가능한 결정론 순위를 사용했습니다.",
    );
  }

  const rejected = routed
    .filter((candidate) => candidate.eligibility === "INELIGIBLE")
    .sort((a, b) => a.route.durationMinutes - b.route.durationMinutes);
  const routingMode = routed.every((candidate) => candidate.route.mode === "LIVE")
    ? "LIVE"
    : routed.length > 0
      ? "ESTIMATED"
      : "ERROR";

  return {
    recommendations,
    nearestRejected: rejected[0],
    sourceStatus: {
      nemc: nemcMode,
      routing: routingMode,
      ranking: rankingMode,
      queriedAt: new Date().toISOString(),
      warnings: unique(warnings),
    },
    totalHospitals: withinRadius.length,
    eligibleHospitals: confirmed.length + verifyRequired.length,
  };
}
