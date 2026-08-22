import { describe, expect, it } from "vitest";
import { getHospitalHistory, historicalDataSource } from "./metrics";

describe("과거 NEMC 관측 이력", () => {
  it("수집 메타데이터를 공개한다", () => {
    expect(historicalDataSource.mode).toBe("OBSERVATION_ONLY");
    expect(historicalDataSource.hospitalCount).toBeGreaterThan(0);
    expect(Date.parse(historicalDataSource.observedFrom)).toBeLessThan(
      Date.parse(historicalDataSource.observedTo),
    );
  });

  it("HPID와 선택 치료영역으로 관측 이력을 결합한다", () => {
    const history = getHospitalHistory("A2700007", ["MKioskTy20"]);

    expect(history).not.toBeNull();
    expect(history?.treatments).toHaveLength(1);
    expect(history?.treatments[0].observationCount).toBeGreaterThan(0);
    expect(history?.treatments[0].label).toBe("수족지접합");
  });

  it("수집 범위 밖 병원은 과거 상태를 추정하지 않는다", () => {
    expect(getHospitalHistory("NOT_COLLECTED", ["MKioskTy20"])).toBeNull();
  });
});
