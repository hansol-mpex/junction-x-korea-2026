import { describe, expect, it } from "vitest";
import { PatientAnalysisRequestSchema } from "./schemas";

describe("환자 상태 입력", () => {
  it("두 글자 치료 키워드도 분석 요청으로 허용한다", () => {
    expect(
      PatientAnalysisRequestSchema.safeParse({ narrative: "분만" }).success,
    ).toBe(true);
  });

  it("공백이나 한 글자 입력은 거부한다", () => {
    expect(
      PatientAnalysisRequestSchema.safeParse({ narrative: " " }).success,
    ).toBe(false);
    expect(
      PatientAnalysisRequestSchema.safeParse({ narrative: "암" }).success,
    ).toBe(false);
  });
});
