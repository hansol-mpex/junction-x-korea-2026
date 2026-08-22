import { z } from "zod";

const blankToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const optionalKey = z.preprocess(blankToUndefined, z.string().min(1).optional());

const ServerEnvSchema = z.object({
  NEMC_API_KEY: optionalKey,
  GEMINI_API_KEY: optionalKey,
  GEMINI_MODEL: z.preprocess(
    blankToUndefined,
    z.string().min(1).default("gemini-3.5-flash-lite"),
  ),
  KAKAO_MOBILITY_REST_KEY: optionalKey,
});

export function getServerEnv() {
  return ServerEnvSchema.parse({
    NEMC_API_KEY: process.env.NEMC_API_KEY,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    GEMINI_MODEL: process.env.GEMINI_MODEL,
    KAKAO_MOBILITY_REST_KEY: process.env.KAKAO_MOBILITY_REST_KEY,
  });
}

export function getMissingServerKeys() {
  const env = getServerEnv();
  return [
    !env.NEMC_API_KEY && "NEMC_API_KEY",
    !env.GEMINI_API_KEY && "GEMINI_API_KEY",
    !env.KAKAO_MOBILITY_REST_KEY && "KAKAO_MOBILITY_REST_KEY",
  ].filter((key): key is string => Boolean(key));
}
