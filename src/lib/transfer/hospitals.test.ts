import { describe, expect, it } from "vitest";
import type { TransferHospital } from "./schemas";
import {
  evaluateTransferHospital,
  normalizeNemcAvailability,
  sortHospitalCandidates,
} from "./hospitals";

function hospital(
  overrides: Partial<TransferHospital> = {},
): TransferHospital {
  return {
    hpid: "A1",
    name: "테스트병원",
    region: "경상북도",
    address: "테스트 주소",
    tier: "지역응급의료센터",
    phone: "054-000-0000",
    lat: 36,
    lng: 129,
    hvec: 3,
    hvidate: "20260822230000",
    gateRaw: "Y",
    gate: "Y",
    treatments: [
      {
        code: "MKioskTy20",
        label: "수족지접합",
        raw: "Y",
        normalized: "Y",
      },
    ],
    ...overrides,
  };
}

describe("NEMC 치료영역 상태", () => {
  it("공식 응답 문자열을 정규화한다", () => {
    expect(normalizeNemcAvailability("Y ")).toBe("Y");
    expect(normalizeNemcAvailability("N1")).toBe("N1");
    expect(normalizeNemcAvailability("불가능")).toBe("N");
    expect(normalizeNemcAvailability("정보미제공")).toBe("UNKNOWN");
  });

  it("게이트, 병상, 치료영역이 모두 확인되면 처치 가능이다", () => {
    expect(evaluateTransferHospital(hospital()).state).toBe("CONFIRMED");
  });

  it("치료영역 정보미제공은 확인 필요다", () => {
    const result = evaluateTransferHospital(
      hospital({
        treatments: [
          {
            code: "MKioskTy20",
            label: "수족지접합",
            raw: "정보미제공",
            normalized: "UNKNOWN",
          },
        ],
      }),
    );
    expect(result.state).toBe("VERIFY_REQUIRED");
    expect(result.reason).toContain("수족지접합");
  });

  it("가용병상 0이면 치료영역이 Y여도 처치 불가다", () => {
    expect(evaluateTransferHospital(hospital({ hvec: 0 })).state).toBe(
      "REPORTED_UNAVAILABLE",
    );
  });
});

describe("병원 정렬", () => {
  it("상태를 먼저, 같은 상태에서는 ETA를 우선한다", () => {
    const base = hospital();
    const sorted = sortHospitalCandidates([
      {
        ...base,
        hpid: "VERIFY",
        state: "VERIFY_REQUIRED",
        stateReason: "확인 필요",
        history: null,
        route: { distanceKm: 2, durationMinutes: 5, mode: "LIVE" },
      },
      {
        ...base,
        hpid: "SLOW",
        state: "CONFIRMED",
        stateReason: "확인",
        history: null,
        route: { distanceKm: 20, durationMinutes: 30, mode: "LIVE" },
      },
      {
        ...base,
        hpid: "FAST",
        state: "CONFIRMED",
        stateReason: "확인",
        history: null,
        route: { distanceKm: 10, durationMinutes: 20, mode: "LIVE" },
      },
    ]);

    expect(sorted.map((item) => item.hpid)).toEqual([
      "FAST",
      "SLOW",
      "VERIFY",
    ]);
  });
});
