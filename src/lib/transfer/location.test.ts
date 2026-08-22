import { describe, expect, it } from "vitest";
import { normalizeKoreanRoadAddress } from "./location";

describe("도로명주소 시도 정규화", () => {
  it("Daum Postcode 축약 시도명을 공식 명칭으로 확장한다", () => {
    expect(
      normalizeKoreanRoadAddress("경북 포항시 남구 청암로 77"),
    ).toBe("경상북도 포항시 남구 청암로 77");
    expect(normalizeKoreanRoadAddress("충북 청주시 상당구 상당로 82")).toBe(
      "충청북도 청주시 상당구 상당로 82",
    );
  });

  it("이미 전체 명칭인 주소는 유지하고 공백만 정리한다", () => {
    expect(
      normalizeKoreanRoadAddress("  경상북도  포항시 남구 청암로 77  "),
    ).toBe("경상북도 포항시 남구 청암로 77");
  });
});
