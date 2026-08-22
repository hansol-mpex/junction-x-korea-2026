import type {
  EvaluatedCandidate,
  RankedCandidate,
} from "@/lib/domain/schemas";
import { estimateRoadRoute, haversineKm } from "@/lib/routing/haversine";

/**
 * 병원 내 처치 시간은 공개 데이터에 존재하지 않는다. 아래 값은 후보 간
 * 비교를 위한 도식용 고정 가정값이며 임상 예후 예측이 아니다.
 * UI는 반드시 이 값을 가정값으로 표기해야 한다.
 */
export const timelineAssumptions = {
  erAssessmentMinutes: 20,
  transferPrepMinutes: 15,
  resuscitationMinutes: 10,
  imagingMinutes: 5,
  surgeryBlockMinutes: 25,
  icuBlockMinutes: 30,
} as const;

const surgeryReadyMinutes =
  timelineAssumptions.resuscitationMinutes + timelineAssumptions.imagingMinutes;

export type TimelineSegmentKind =
  | "TRANSPORT"
  | "EMERGENCY"
  | "IMAGING"
  | "SURGERY"
  | "ICU"
  | "BLOCKED"
  | "RETRANSFER"
  | "UNVERIFIED";

export interface TimelineSegment {
  kind: TimelineSegmentKind;
  label: string;
  startMinute: number;
  endMinute: number;
}

export interface TimelineLane {
  id: string;
  name: string;
  subtitle: string;
  badge: string;
  tone: "REJECTED" | "PRIMARY" | "CONFIRMED" | "VERIFY";
  segments: TimelineSegment[];
  surgeryStartMinute: number | null;
  breakLabel: string | null;
}

export interface CareChainTimeline {
  lanes: TimelineLane[];
  axisMaxMinute: number;
  axisTicks: number[];
  /** 최근접 부적격 병원 경유 시 지연되는 수술 시작 시각(분). 비교 불가 시 null */
  detourDelayMinutes: number | null;
  detourLaneId: string | null;
  primaryLaneId: string | null;
}

function segment(
  kind: TimelineSegmentKind,
  label: string,
  startMinute: number,
  lengthMinutes: number,
): TimelineSegment {
  return {
    kind,
    label,
    startMinute,
    endMinute: startMinute + lengthMinutes,
  };
}

function satisfiedLabels(candidate: EvaluatedCandidate) {
  return new Set(
    candidate.capabilityEvidence
      .filter((item) => item.state === "SATISFIED")
      .map((item) => item.label),
  );
}

function buildRankedLane(candidate: RankedCandidate): TimelineLane {
  const eta = candidate.route.durationMinutes;
  const satisfied = satisfiedLabels(candidate);
  const entryLabel = satisfied.has("외상소생실") ? "외상소생실" : "응급실";
  const hasImaging = satisfied.has("CT");

  const segments: TimelineSegment[] = [
    segment("TRANSPORT", `이송 ${eta}분`, 0, eta),
  ];

  if (hasImaging) {
    segments.push(
      segment(
        "EMERGENCY",
        entryLabel,
        eta,
        timelineAssumptions.resuscitationMinutes,
      ),
      segment(
        "IMAGING",
        "CT",
        eta + timelineAssumptions.resuscitationMinutes,
        timelineAssumptions.imagingMinutes,
      ),
    );
  } else {
    // CT를 확인하지 못한 경우에도 준비 구간의 길이는 동일하게 유지해
    // 후보 간 수술 시작 시각 비교가 왜곡되지 않도록 한다.
    segments.push(
      segment("EMERGENCY", entryLabel, eta, surgeryReadyMinutes),
    );
  }

  const surgeryStart = eta + surgeryReadyMinutes;
  const unverified = candidate.verificationReasons;

  if (unverified.length > 0) {
    segments.push(
      segment(
        "UNVERIFIED",
        unverified.slice(0, 2).join(" · "),
        surgeryStart,
        timelineAssumptions.surgeryBlockMinutes,
      ),
    );
    return {
      id: candidate.hospital.hpid,
      name: candidate.hospital.name,
      subtitle: `${candidate.route.distanceKm.toFixed(1)}km · ${eta}분`,
      badge: `${candidate.rank}순위 · 확인 필요`,
      tone: "VERIFY",
      segments,
      surgeryStartMinute: null,
      breakLabel: "전화 검증 필요",
    };
  }

  segments.push(
    segment(
      "SURGERY",
      "수술",
      surgeryStart,
      timelineAssumptions.surgeryBlockMinutes,
    ),
    segment(
      "ICU",
      "중환자실",
      surgeryStart + timelineAssumptions.surgeryBlockMinutes,
      timelineAssumptions.icuBlockMinutes,
    ),
  );

  return {
    id: candidate.hospital.hpid,
    name: candidate.hospital.name,
    subtitle: `${candidate.route.distanceKm.toFixed(1)}km · ${eta}분`,
    badge: candidate.rank === 1 ? "1순위" : `${candidate.rank}순위`,
    tone: candidate.rank === 1 ? "PRIMARY" : "CONFIRMED",
    segments,
    surgeryStartMinute: surgeryStart,
    breakLabel: null,
  };
}

function buildRejectedLane(
  rejected: EvaluatedCandidate,
  primary: RankedCandidate | undefined,
): TimelineLane {
  const eta = rejected.route.durationMinutes;
  const blockLabel = rejected.rejectionReasons[0] ?? "최종치료 역량 미충족";

  const segments: TimelineSegment[] = [
    segment("TRANSPORT", `이송 ${eta}분`, 0, eta),
    segment(
      "EMERGENCY",
      "응급실 평가",
      eta,
      timelineAssumptions.erAssessmentMinutes,
    ),
    segment(
      "BLOCKED",
      blockLabel,
      eta + timelineAssumptions.erAssessmentMinutes,
      timelineAssumptions.transferPrepMinutes,
    ),
  ];

  let surgeryStartMinute: number | null = null;

  if (primary) {
    const transferMinutes = estimateRoadRoute(
      haversineKm(rejected.hospital, primary.hospital),
    ).durationMinutes;
    const retransferStart =
      eta +
      timelineAssumptions.erAssessmentMinutes +
      timelineAssumptions.transferPrepMinutes;

    segments.push(
      segment(
        "RETRANSFER",
        `재전원 · ${primary.hospital.name}까지 ${transferMinutes}분`,
        retransferStart,
        transferMinutes,
      ),
    );

    surgeryStartMinute = retransferStart + transferMinutes + surgeryReadyMinutes;
    segments.push(
      segment(
        "EMERGENCY",
        "도착·수술 준비",
        retransferStart + transferMinutes,
        surgeryReadyMinutes,
      ),
      segment(
        "SURGERY",
        "수술",
        surgeryStartMinute,
        timelineAssumptions.surgeryBlockMinutes,
      ),
    );
  }

  return {
    id: rejected.hospital.hpid,
    name: rejected.hospital.name,
    subtitle: `최단 ${rejected.route.distanceKm.toFixed(1)}km · ${eta}분`,
    badge: "탈락",
    tone: "REJECTED",
    segments,
    surgeryStartMinute,
    breakLabel: "치료 사슬 단절",
  };
}

function buildAxisTicks(maxMinute: number) {
  const step = maxMinute > 240 ? 60 : maxMinute > 120 ? 30 : 20;
  const ticks: number[] = [];
  for (let value = 0; value <= maxMinute; value += step) ticks.push(value);
  return ticks;
}

export function buildCareChainTimeline({
  recommendations,
  nearestRejected,
}: {
  recommendations: RankedCandidate[];
  nearestRejected?: EvaluatedCandidate;
}): CareChainTimeline {
  const primary = recommendations.find((item) => item.rank === 1);
  const rankedLanes = recommendations.map(buildRankedLane);

  // 최근접 부적격 병원은 "1순위보다 가까울 때"만 비교 의미가 있다.
  const showRejected =
    nearestRejected !== undefined &&
    primary !== undefined &&
    nearestRejected.route.durationMinutes < primary.route.durationMinutes;

  const rejectedLane = showRejected
    ? buildRejectedLane(nearestRejected, primary)
    : null;

  const lanes = rejectedLane ? [rejectedLane, ...rankedLanes] : rankedLanes;

  const rawMax = lanes.reduce(
    (max, lane) =>
      lane.segments.reduce((inner, item) => Math.max(inner, item.endMinute), max),
    60,
  );
  const axisMaxMinute = Math.ceil(rawMax / 20) * 20;

  const primaryLane = rankedLanes.find((lane) => lane.tone === "PRIMARY");
  const detourDelayMinutes =
    rejectedLane?.surgeryStartMinute != null &&
    primaryLane?.surgeryStartMinute != null
      ? rejectedLane.surgeryStartMinute - primaryLane.surgeryStartMinute
      : null;

  return {
    lanes,
    axisMaxMinute,
    axisTicks: buildAxisTicks(axisMaxMinute),
    detourDelayMinutes,
    detourLaneId: rejectedLane?.id ?? null,
    primaryLaneId: primaryLane?.id ?? null,
  };
}
