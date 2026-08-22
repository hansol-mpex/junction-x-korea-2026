import { describe, expect, it } from "vitest";
import type {
  CapabilityCode,
  HospitalSnapshot,
  RouteEstimate,
} from "@/lib/domain/schemas";
import { evaluateCandidate, MAX_TRANSPORT_MINUTES } from "./eligibility";

const requiredCapabilities: CapabilityCode[] = [
  "ER_GATEKEEPER",
  "OPERATING_ROOM",
  "VENTILATOR",
];

function hospital(overrides: Partial<HospitalSnapshot> = {}): HospitalSnapshot {
  return {
    hpid: "H1",
    name: "테스트 병원",
    address: "경상북도",
    region: "경상북도",
    isTraumaCenter: false,
    lat: 36.5,
    lng: 128.7,
    erOperating: true,
    beds: { hvoc: 2 },
    equipment: { hvventiayn: "Y" },
    acceptance: { MKioskTy28: "Y" },
    basicCapabilities: {},
    sourceAgeMinutes: 5,
    sourceMode: "LIVE",
    ...overrides,
  };
}

function route(
  durationMinutes: number,
  mode: RouteEstimate["mode"] = "ESTIMATED",
): RouteEstimate {
  return { distanceKm: durationMinutes, durationMinutes, mode };
}

describe("evaluateCandidate", () => {
  it("모든 필수역량이 Y이면 CONFIRMED", () => {
    const result = evaluateCandidate({
      hospital: hospital(),
      route: route(40),
      requiredCapabilities,
    });
    expect(result.eligibility).toBe("CONFIRMED");
    expect(result.rejectionReasons).toHaveLength(0);
  });

  it("N1(보유·사용불가)은 가용으로 보지 않고 탈락시킨다", () => {
    const result = evaluateCandidate({
      hospital: hospital({ equipment: { hvventiayn: "N1" } }),
      route: route(40),
      requiredCapabilities,
    });
    expect(result.eligibility).toBe("INELIGIBLE");
    expect(result.rejectionReasons.join()).toContain("N1");
  });

  it("가용 0인 병상은 탈락 사유가 된다", () => {
    const result = evaluateCandidate({
      hospital: hospital({ beds: { hvoc: 0 } }),
      route: route(40),
      requiredCapabilities,
    });
    expect(result.eligibility).toBe("INELIGIBLE");
  });

  it("정보미제공은 통과시키지 않고 VERIFY_REQUIRED로 분리한다", () => {
    const result = evaluateCandidate({
      hospital: hospital({ acceptance: {} }),
      route: route(40),
      requiredCapabilities,
    });
    expect(result.eligibility).toBe("VERIFY_REQUIRED");
    expect(result.verificationReasons.join()).toContain("정보 미제공");
  });

  it("추정 경로여도 탐색 한도를 초과하면 탈락시킨다", () => {
    const result = evaluateCandidate({
      hospital: hospital(),
      route: route(MAX_TRANSPORT_MINUTES + 1, "ESTIMATED"),
      requiredCapabilities,
    });
    expect(result.eligibility).toBe("INELIGIBLE");
    expect(result.rejectionReasons.join()).toContain("탐색 한도");
  });

  it("한도 이내면 추정 경로도 통과시킨다", () => {
    const result = evaluateCandidate({
      hospital: hospital(),
      route: route(MAX_TRANSPORT_MINUTES, "ESTIMATED"),
      requiredCapabilities,
    });
    expect(result.eligibility).toBe("CONFIRMED");
  });
});
