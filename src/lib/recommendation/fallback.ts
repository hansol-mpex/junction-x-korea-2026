import type {
  EvaluatedCandidate,
  RankedCandidate,
  RecommendationReasonCode,
} from "@/lib/domain/schemas";

const riskWeight = { LOW: 0, CAUTION: 1, HIGH: 2 } as const;

/**
 * 중증외상은 시간 민감 질환이므로 ETA가 자원 여유보다 우선한다.
 * 다만 몇 분 차이로 데이터 신뢰도가 높은 병원이 밀리지 않도록
 * ETA를 15분 구간으로 묶어 비교한 뒤 나머지 기준으로 동점을 푼다.
 */
const ETA_BUCKET_MINUTES = 15;

function etaBucket(minutes: number) {
  return Math.floor(minutes / ETA_BUCKET_MINUTES);
}

export function sortCandidatesDeterministically(
  candidates: EvaluatedCandidate[],
) {
  return [...candidates].sort((left, right) => {
    if (left.eligibility !== right.eligibility) {
      return left.eligibility === "CONFIRMED" ? -1 : 1;
    }
    const leftBucket = etaBucket(left.route.durationMinutes);
    const rightBucket = etaBucket(right.route.durationMinutes);
    if (leftBucket !== rightBucket) {
      return leftBucket - rightBucket;
    }
    if (riskWeight[left.risk] !== riskWeight[right.risk]) {
      return riskWeight[left.risk] - riskWeight[right.risk];
    }
    if (left.hospital.isTraumaCenter !== right.hospital.isTraumaCenter) {
      return left.hospital.isTraumaCenter ? -1 : 1;
    }
    if (left.capacityBuffer !== right.capacityBuffer) {
      return right.capacityBuffer - left.capacityBuffer;
    }
    return left.route.durationMinutes - right.route.durationMinutes;
  });
}

function reasonCodesFor(
  candidate: EvaluatedCandidate,
  fastestMinutes: number,
): RecommendationReasonCode[] {
  const reasons: RecommendationReasonCode[] = [];
  if (candidate.eligibility === "CONFIRMED") reasons.push("COMPLETE_CARE_CHAIN");
  if (candidate.route.durationMinutes <= fastestMinutes + 5) {
    reasons.push("SHORTER_ETA");
  }
  if (candidate.hospital.isTraumaCenter) reasons.push("TRAUMA_CENTER");
  if (candidate.risk === "LOW") reasons.push("LOW_DATA_RISK");
  if (
    candidate.hospital.sourceAgeMinutes !== undefined &&
    candidate.hospital.sourceAgeMinutes <= 10
  ) {
    reasons.push("FRESH_DATA");
  }
  if (candidate.capacityBuffer >= 6) reasons.push("STRONG_CAPACITY");
  if (reasons.length === 0) reasons.push("SHORTER_ETA");
  return reasons.slice(0, 4);
}

function tradeoffCodesFor(
  candidate: EvaluatedCandidate,
  fastestMinutes: number,
): RecommendationReasonCode[] {
  const tradeoffs: RecommendationReasonCode[] = [];
  if (candidate.eligibility === "VERIFY_REQUIRED") {
    tradeoffs.push("VERIFICATION_REQUIRED");
  }
  if (candidate.route.durationMinutes > fastestMinutes + 15) {
    tradeoffs.push("LONGER_TRANSPORT");
  }
  if (candidate.capacityBuffer <= 2) tradeoffs.push("LIMITED_BUFFER");
  return tradeoffs;
}

export function deterministicRanking(
  candidates: EvaluatedCandidate[],
): RankedCandidate[] {
  const sorted = sortCandidatesDeterministically(candidates).slice(0, 3);
  const fastest = Math.min(
    ...candidates.map((candidate) => candidate.route.durationMinutes),
  );

  return sorted.map((candidate, index) => ({
    ...candidate,
    rank: index + 1,
    reasonCodes: reasonCodesFor(candidate, fastest),
    tradeoffCodes: tradeoffCodesFor(candidate, fastest),
  }));
}
