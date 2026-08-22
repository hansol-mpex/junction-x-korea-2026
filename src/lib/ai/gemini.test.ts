import { describe, expect, it } from "vitest";
import type { EvaluatedCandidate, HospitalSnapshot } from "@/lib/domain/schemas";
import { buildRankedFromAiResponse } from "./gemini";

function candidate({
  hpid,
  durationMinutes,
  eligibility = "CONFIRMED",
}: {
  hpid: string;
  durationMinutes: number;
  eligibility?: EvaluatedCandidate["eligibility"];
}): EvaluatedCandidate {
  const hospital: HospitalSnapshot = {
    hpid,
    name: `${hpid} 병원`,
    address: "경상북도",
    region: "경상북도",
    isTraumaCenter: false,
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
    risk: "CAUTION",
    riskReasons: [],
    capacityBuffer: 3,
  };
}

function aiResponse(ids: string[]) {
  return JSON.stringify({
    ranked: ids.map((hospitalId) => ({
      hospitalId,
      reasonCodes: ["COMPLETE_CARE_CHAIN"],
      tradeoffCodes: [],
    })),
    warningCodes: [],
  });
}

const near = candidate({ hpid: "NEAR", durationMinutes: 50 });
const mid = candidate({ hpid: "MID", durationMinutes: 70 });
const far = candidate({ hpid: "FAR", durationMinutes: 130 });

describe("buildRankedFromAiResponse", () => {
  it("허용 후보 안에서 고른 순위는 그대로 사용한다", () => {
    const ranked = buildRankedFromAiResponse({
      rawText: aiResponse(["NEAR", "MID", "FAR"]),
      candidates: [near, mid, far],
    });

    expect(ranked.map((item) => item.hospital.hpid)).toEqual([
      "NEAR",
      "MID",
      "FAR",
    ]);
    expect(ranked.map((item) => item.rank)).toEqual([1, 2, 3]);
  });

  it("후보 목록에 없는 병원을 만들어내면 거부한다", () => {
    expect(() =>
      buildRankedFromAiResponse({
        rawText: aiResponse(["NEAR", "MID", "HALLUCINATED"]),
        candidates: [near, mid, far],
      }),
    ).toThrow(/허용되지 않은/);
  });

  it("같은 병원을 중복해서 올리면 거부한다", () => {
    expect(() =>
      buildRankedFromAiResponse({
        rawText: aiResponse(["NEAR", "NEAR", "MID"]),
        candidates: [near, mid, far],
      }),
    ).toThrow(/중복/);
  });

  it("적격 후보가 2곳뿐인데 3곳을 채워 오면 거부한다", () => {
    expect(() =>
      buildRankedFromAiResponse({
        rawText: aiResponse(["NEAR", "MID", "FAR"]),
        candidates: [near, mid],
      }),
    ).toThrow(/추천 수/);
  });

  it("적격 후보가 2곳이면 2곳만 반환하고 3번째를 만들지 않는다", () => {
    const ranked = buildRankedFromAiResponse({
      rawText: aiResponse(["MID", "NEAR"]),
      candidates: [near, mid],
    });

    expect(ranked).toHaveLength(2);
  });

  it("스키마에 없는 근거 코드를 쓰면 거부한다", () => {
    const rawText = JSON.stringify({
      ranked: [
        { hospitalId: "NEAR", reasonCodes: ["MADE_UP_CODE"], tradeoffCodes: [] },
      ],
      warningCodes: [],
    });

    expect(() =>
      buildRankedFromAiResponse({ rawText, candidates: [near] }),
    ).toThrow();
  });

  it("최속 적격 후보보다 30분 넘게 느린 병원을 1순위로 올리면 거부한다", () => {
    expect(() =>
      buildRankedFromAiResponse({
        rawText: aiResponse(["FAR", "NEAR", "MID"]),
        candidates: [near, mid, far],
      }),
    ).toThrow(/1순위/);
  });

  it("30분 이내 차이면 1순위 교체를 허용한다", () => {
    const ranked = buildRankedFromAiResponse({
      rawText: aiResponse(["MID", "NEAR", "FAR"]),
      candidates: [near, mid, far],
    });

    expect(ranked[0].hospital.hpid).toBe("MID");
  });

  it("더 가깝지만 확인이 필요한 후보를 기준으로 삼지 않는다", () => {
    const unverifiedNearest = candidate({
      hpid: "UNVERIFIED",
      durationMinutes: 20,
      eligibility: "VERIFY_REQUIRED",
    });
    const confirmedFar = candidate({ hpid: "CONFIRMED_FAR", durationMinutes: 90 });

    const ranked = buildRankedFromAiResponse({
      rawText: aiResponse(["CONFIRMED_FAR", "UNVERIFIED"]),
      candidates: [unverifiedNearest, confirmedFar],
    });

    expect(ranked[0].hospital.hpid).toBe("CONFIRMED_FAR");
  });

  it("후보가 없으면 빈 배열을 돌려준다", () => {
    expect(
      buildRankedFromAiResponse({ rawText: aiResponse([]), candidates: [] }),
    ).toEqual([]);
  });
});
