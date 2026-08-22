import { describe, expect, it } from "vitest";
import type { EvaluatedCandidate, HospitalSnapshot } from "@/lib/domain/schemas";
import {
  deterministicRanking,
  sortCandidatesDeterministically,
} from "./fallback";

function candidate({
  hpid,
  name,
  durationMinutes,
  capacityBuffer = 3,
  isTraumaCenter = false,
  eligibility = "CONFIRMED",
  risk = "CAUTION",
}: {
  hpid: string;
  name: string;
  durationMinutes: number;
  capacityBuffer?: number;
  isTraumaCenter?: boolean;
  eligibility?: EvaluatedCandidate["eligibility"];
  risk?: EvaluatedCandidate["risk"];
}): EvaluatedCandidate {
  const hospital: HospitalSnapshot = {
    hpid,
    name,
    address: "경상북도",
    region: "경상북도",
    isTraumaCenter,
    lat: 36.5,
    lng: 128.7,
    erOperating: true,
    beds: {},
    equipment: {},
    acceptance: {},
    basicCapabilities: {},
    sourceAgeMinutes: 5,
    sourceMode: "LIVE",
  };

  return {
    hospital,
    route: { distanceKm: durationMinutes, durationMinutes, mode: "ESTIMATED" },
    eligibility,
    capabilityEvidence: [],
    rejectionReasons: [],
    verificationReasons: [],
    risk,
    riskReasons: [],
    capacityBuffer,
  };
}

describe("sortCandidatesDeterministically", () => {
  it("자원 여유가 커도 이동시간이 크게 긴 병원을 앞세우지 않는다", () => {
    const near = candidate({
      hpid: "NEAR",
      name: "가까운 외상센터",
      durationMinutes: 50,
      capacityBuffer: 6,
      isTraumaCenter: true,
    });
    const far = candidate({
      hpid: "FAR",
      name: "먼 대형병원",
      durationMinutes: 133,
      capacityBuffer: 9,
      isTraumaCenter: true,
    });

    const sorted = sortCandidatesDeterministically([far, near]);
    expect(sorted[0].hospital.hpid).toBe("NEAR");
  });

  it("CONFIRMED가 VERIFY_REQUIRED보다 항상 앞선다", () => {
    const verify = candidate({
      hpid: "V",
      name: "확인필요",
      durationMinutes: 20,
      eligibility: "VERIFY_REQUIRED",
    });
    const confirmed = candidate({
      hpid: "C",
      name: "확인완료",
      durationMinutes: 90,
    });

    const sorted = sortCandidatesDeterministically([verify, confirmed]);
    expect(sorted[0].hospital.hpid).toBe("C");
  });

  it("같은 15분 구간이면 데이터 위험이 낮은 쪽을 앞세운다", () => {
    const risky = candidate({
      hpid: "RISK",
      name: "위험높음",
      durationMinutes: 32,
      risk: "HIGH",
    });
    const safe = candidate({
      hpid: "SAFE",
      name: "위험낮음",
      durationMinutes: 38,
      risk: "LOW",
    });

    const sorted = sortCandidatesDeterministically([risky, safe]);
    expect(sorted[0].hospital.hpid).toBe("SAFE");
  });
});

describe("deterministicRanking", () => {
  it("최대 3곳까지 순위를 매기고 동일 입력에 동일 결과를 낸다", () => {
    const pool = [
      candidate({ hpid: "A", name: "A", durationMinutes: 40 }),
      candidate({ hpid: "B", name: "B", durationMinutes: 60 }),
      candidate({ hpid: "C", name: "C", durationMinutes: 80 }),
      candidate({ hpid: "D", name: "D", durationMinutes: 100 }),
    ];

    const first = deterministicRanking(pool);
    const second = deterministicRanking([...pool].reverse());

    expect(first).toHaveLength(3);
    expect(first.map((item) => item.hospital.hpid)).toEqual(["A", "B", "C"]);
    expect(second.map((item) => item.hospital.hpid)).toEqual(["A", "B", "C"]);
    expect(first[0].rank).toBe(1);
  });

  it("가장 느린 후보에는 LONGER_TRANSPORT 트레이드오프를 붙인다", () => {
    const ranked = deterministicRanking([
      candidate({ hpid: "A", name: "A", durationMinutes: 40 }),
      candidate({ hpid: "B", name: "B", durationMinutes: 100 }),
    ]);
    expect(ranked[1].tradeoffCodes).toContain("LONGER_TRANSPORT");
  });
});
