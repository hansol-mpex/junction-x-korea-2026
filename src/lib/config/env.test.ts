import { afterEach, describe, expect, it } from "vitest";
import { getMissingServerKeys, getServerEnv } from "./env";

const KEYS = [
  "NEMC_API_KEY",
  "GEMINI_API_KEY",
  "GEMINI_MODEL",
  "KAKAO_MOBILITY_REST_KEY",
] as const;

const original = Object.fromEntries(
  KEYS.map((key) => [key, process.env[key]]),
) as Record<(typeof KEYS)[number], string | undefined>;

afterEach(() => {
  for (const key of KEYS) {
    if (original[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = original[key];
    }
  }
});

describe("서버 환경변수", () => {
  it(".env.example을 그대로 복사한 빈 값에서도 예외 없이 파싱한다", () => {
    for (const key of KEYS) {
      process.env[key] = "";
    }

    expect(() => getServerEnv()).not.toThrow();
    const env = getServerEnv();
    expect(env.NEMC_API_KEY).toBeUndefined();
    expect(env.GEMINI_API_KEY).toBeUndefined();
    expect(env.KAKAO_MOBILITY_REST_KEY).toBeUndefined();
  });

  it("빈 GEMINI_MODEL은 기본 모델명으로 대체된다", () => {
    process.env.GEMINI_MODEL = "   ";
    expect(getServerEnv().GEMINI_MODEL).toBe("gemini-3.5-flash-lite");
  });

  it("빈 문자열 키는 미설정으로 보고된다", () => {
    for (const key of KEYS) {
      process.env[key] = "";
    }

    expect(getMissingServerKeys()).toEqual([
      "NEMC_API_KEY",
      "GEMINI_API_KEY",
      "KAKAO_MOBILITY_REST_KEY",
    ]);
  });

  it("값이 있으면 그대로 보존하고 미설정 목록에서 제외한다", () => {
    process.env.NEMC_API_KEY = "live-key";
    process.env.GEMINI_API_KEY = "";
    process.env.KAKAO_MOBILITY_REST_KEY = "";

    expect(getServerEnv().NEMC_API_KEY).toBe("live-key");
    expect(getMissingServerKeys()).not.toContain("NEMC_API_KEY");
  });
});
