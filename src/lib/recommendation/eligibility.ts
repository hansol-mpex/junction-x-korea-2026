import { capabilityRules } from "@/lib/domain/capabilities";
import {
  capabilityLabels,
  type AvailabilityStatus,
  type CapabilityCode,
  type CapabilityEvidence,
  type DataRiskLevel,
  type EvaluatedCandidate,
  type HospitalSnapshot,
  type RouteEstimate,
} from "@/lib/domain/schemas";

/**
 * 육로 이송 탐색 한도. 경로 API 성공(LIVE) 여부와 무관하게 적용한다.
 * 추정 경로일 때만 한도를 건너뛰면 실제로는 도달 불가능한 병원이
 * 후보로 올라와 상황요원을 오도할 수 있다.
 */
export const MAX_TRANSPORT_MINUTES = 120;

function availabilityEvidence(
  status: AvailabilityStatus | undefined,
): CapabilityEvidence["state"] {
  if (status === "Y") return "SATISFIED";
  if (status === "N" || status === "N1" || status === "UNAVAILABLE") {
    return "FAILED";
  }
  return "UNKNOWN";
}

function evaluateCapability(
  hospital: HospitalSnapshot,
  code: CapabilityCode,
): CapabilityEvidence {
  const rule = capabilityRules[code];
  const label = capabilityLabels[code];

  if (rule.kind === "POSITIVE_NUMBER") {
    const value = hospital.beds[rule.field];
    if (value === undefined) {
      return {
        code,
        label,
        state: "UNKNOWN",
        detail: `${label} 정보 미제공`,
      };
    }
    return {
      code,
      label,
      state: value > 0 ? "SATISFIED" : "FAILED",
      detail: `${label} 가용 ${value}`,
    };
  }

  const source = hospital[rule.source] as Record<
    string,
    AvailabilityStatus | undefined
  >;
  const status = source[rule.field] ?? "UNKNOWN";
  return {
    code,
    label,
    state: availabilityEvidence(status),
    detail:
      status === "Y"
        ? `${label} 가용`
        : status === "UNKNOWN"
          ? `${label} 정보 미제공`
          : `${label} 현재 불가 (${status})`,
  };
}

function calculateCapacityBuffer(
  hospital: HospitalSnapshot,
  required: CapabilityCode[],
) {
  return required.reduce((sum, code) => {
    const rule = capabilityRules[code];
    if (rule.kind !== "POSITIVE_NUMBER") return sum;
    return sum + Math.max(0, hospital.beds[rule.field] ?? 0);
  }, 0);
}

function assessRisk({
  hospital,
  evidence,
  capacityBuffer,
}: {
  hospital: HospitalSnapshot;
  evidence: CapabilityEvidence[];
  capacityBuffer: number;
}): { level: DataRiskLevel; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;

  if (hospital.sourceMode === "SNAPSHOT") {
    score = Math.max(score, 1);
    reasons.push("발표용 스냅샷 데이터");
  }

  if (hospital.sourceAgeMinutes === undefined) {
    score = 2;
    reasons.push("업데이트 시각 미제공");
  } else if (hospital.sourceAgeMinutes > 30) {
    score = 2;
    reasons.push(`업데이트 ${hospital.sourceAgeMinutes}분 경과`);
  } else if (hospital.sourceAgeMinutes > 10) {
    score = Math.max(score, 1);
    reasons.push(`업데이트 ${hospital.sourceAgeMinutes}분 경과`);
  } else {
    reasons.push(`업데이트 ${hospital.sourceAgeMinutes}분 경과`);
  }

  if (evidence.some((item) => item.state === "UNKNOWN")) {
    score = 2;
    reasons.push("필수역량 정보 일부 미제공");
  }

  if (capacityBuffer <= 2) {
    score = Math.max(score, 1);
    reasons.push("필수 병상 가용 여유가 작음");
  }

  return {
    level: score === 0 ? "LOW" : score === 1 ? "CAUTION" : "HIGH",
    reasons,
  };
}

export function evaluateCandidate({
  hospital,
  route,
  requiredCapabilities,
}: {
  hospital: HospitalSnapshot;
  route: RouteEstimate;
  requiredCapabilities: CapabilityCode[];
}): EvaluatedCandidate {
  const evidence = requiredCapabilities.map((code) =>
    evaluateCapability(hospital, code),
  );
  const rejectionReasons: string[] = [];
  const verificationReasons: string[] = [];

  if (!hospital.erOperating) {
    rejectionReasons.push("응급실 운영 상태가 아님");
  }
  if (route.durationMinutes > MAX_TRANSPORT_MINUTES) {
    rejectionReasons.push(
      `예상 주행 ${route.durationMinutes}분으로 탐색 한도(${MAX_TRANSPORT_MINUTES}분) 초과`,
    );
  }

  for (const item of evidence) {
    if (item.state === "FAILED") rejectionReasons.push(item.detail);
    if (item.state === "UNKNOWN") verificationReasons.push(item.detail);
  }

  const eligibility =
    rejectionReasons.length > 0
      ? "INELIGIBLE"
      : verificationReasons.length > 0
        ? "VERIFY_REQUIRED"
        : "CONFIRMED";
  const capacityBuffer = calculateCapacityBuffer(
    hospital,
    requiredCapabilities,
  );
  const risk = assessRisk({ hospital, evidence, capacityBuffer });

  return {
    hospital,
    route,
    eligibility,
    capabilityEvidence: evidence,
    rejectionReasons,
    verificationReasons,
    risk: risk.level,
    riskReasons: risk.reasons,
    capacityBuffer,
  };
}
