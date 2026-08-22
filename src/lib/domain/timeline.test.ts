import { describe, expect, it } from "vitest";
import type {
  EvaluatedCandidate,
  HospitalSnapshot,
  RankedCandidate,
} from "@/lib/domain/schemas";
import { buildCareChainTimeline, timelineAssumptions } from "./timeline";

function hospital(
  hpid: string,
  name: string,
  lat: number,
  lng: number,
): HospitalSnapshot {
  return {
    hpid,
    name,
    address: "경상북도",
    region: "경상북도",
    isTraumaCenter: false,
    lat,
    lng,
    erOperating: true,
    beds: {},
    equipment: {},
    acceptance: {},
    basicCapabilities: {},
    sourceAgeMinutes: 5,
    sourceMode: "SNAPSHOT",
  };
}

function base(
  hpid: string,
  name: string,
  durationMinutes: number,
  lat: number,
  lng: number,
): EvaluatedCandidate {
  return {
    hospital: hospital(hpid, name, lat, lng),
    route: { distanceKm: durationMinutes, durationMinutes, mode: "ESTIMATED" },
    eligibility: "CONFIRMED",
    capabilityEvidence: [
      { code: "CT", label: "CT", state: "SATISFIED", detail: "CT 가용" },
      {
        code: "TRAUMA_RESUSCITATION",
        label: "외상소생실",
        state: "SATISFIED",
        detail: "외상소생실 가용 1",
      },
    ],
    rejectionReasons: [],
    verificationReasons: [],
    risk: "CAUTION",
    riskReasons: [],
    capacityBuffer: 4,
  };
}

function ranked(
  candidate: EvaluatedCandidate,
  rank: number,
): RankedCandidate {
  return {
    ...candidate,
    rank,
    reasonCodes: ["COMPLETE_CARE_CHAIN"],
    tradeoffCodes: [],
  };
}

describe("buildCareChainTimeline", () => {
  const primary = ranked(base("AD", "안동", 50, 36.5684, 128.7283), 1);

  it("1순위의 수술 시작은 도착 후 준비시간만큼만 지연된다", () => {
    const timeline = buildCareChainTimeline({ recommendations: [primary] });
    const lane = timeline.lanes[0];
    expect(lane.surgeryStartMinute).toBe(
      50 +
        timelineAssumptions.resuscitationMinutes +
        timelineAssumptions.imagingMinutes,
    );
    expect(lane.breakLabel).toBeNull();
  });

  it("최근접 부적격 병원이 더 가까우면 재전원 지연을 계산한다", () => {
    const rejected: EvaluatedCandidate = {
      ...base("YY", "영양", 17, 36.6663, 129.1125),
      eligibility: "INELIGIBLE",
      rejectionReasons: ["수술실 가용 0"],
    };

    const timeline = buildCareChainTimeline({
      recommendations: [primary],
      nearestRejected: rejected,
    });

    expect(timeline.lanes[0].tone).toBe("REJECTED");
    expect(timeline.lanes[0].breakLabel).toBe("치료 사슬 단절");
    expect(timeline.detourDelayMinutes).not.toBeNull();
    expect(timeline.detourDelayMinutes!).toBeGreaterThan(0);
  });

  it("최근접 부적격 병원이 1순위보다 멀면 비교 레인을 만들지 않는다", () => {
    const rejected: EvaluatedCandidate = {
      ...base("FAR", "먼병원", 95, 36.0, 129.3),
      eligibility: "INELIGIBLE",
      rejectionReasons: ["수술실 가용 0"],
    };

    const timeline = buildCareChainTimeline({
      recommendations: [primary],
      nearestRejected: rejected,
    });

    expect(timeline.lanes).toHaveLength(1);
    expect(timeline.detourDelayMinutes).toBeNull();
  });

  it("검증이 필요한 후보는 수술 시작을 단정하지 않는다", () => {
    const verify = ranked(
      {
        ...base("MG", "문경", 118, 36.5861, 128.1868),
        eligibility: "VERIFY_REQUIRED",
        verificationReasons: ["복부손상 수술 정보 미제공"],
      },
      2,
    );

    const timeline = buildCareChainTimeline({
      recommendations: [primary, verify],
    });
    const lane = timeline.lanes.find((item) => item.id === "MG")!;
    expect(lane.surgeryStartMinute).toBeNull();
    expect(lane.tone).toBe("VERIFY");
  });
});
