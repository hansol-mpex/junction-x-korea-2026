import { describe, expect, it } from "vitest";
import { buildTransferSummaryText } from "./summary";

describe("이송 후보 요약", () => {
  it("선택 근거와 수용 확인 안내를 빠짐없이 만든다", () => {
    const summary = buildTransferSummaryText({
      selectedAt: "2026.08.23 02:40",
      location: "경상북도 포항시 남구 청암로 77",
      patientNarrative: "오른손 검지 완전 절단",
      treatments: "수족지접합",
      hospitalName: "테스트병원",
      hospitalState: "처치 가능 / 응급실, 가용병상 모두 확인",
      route: "30분 / 28.8km",
      beds: "응급실 3병상",
      dataTimestamp: "2026.08.23 02:35:00",
      phone: "054-000-0000",
    });

    expect(summary).toContain("송민 이송 후보 요약");
    expect(summary).toContain("선택 병원: 테스트병원");
    expect(summary).toContain("필요 치료영역: 수족지접합");
    expect(summary).toContain("30분 / 28.8km");
    expect(summary).toContain("수용 확약이 아닙니다");
  });
});
