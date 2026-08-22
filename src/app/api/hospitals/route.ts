import { NextResponse } from "next/server";
import { getServerEnv } from "@/lib/config/env";
import { searchLiveHospitalCandidates } from "@/lib/transfer/hospitals";
import { HospitalSearchRequestSchema } from "@/lib/transfer/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "요청 본문이 올바른 JSON이 아닙니다." },
      { status: 400 },
    );
  }

  const parsed = HospitalSearchRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "위치와 치료영역 입력을 확인해 주세요.",
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }

  const { NEMC_API_KEY, KAKAO_MOBILITY_REST_KEY } = getServerEnv();
  const missing = [
    !NEMC_API_KEY && "NEMC_API_KEY",
    !KAKAO_MOBILITY_REST_KEY && "KAKAO_MOBILITY_REST_KEY",
  ].filter(Boolean);
  if (missing.length > 0) {
    return NextResponse.json(
      { error: `${missing.join(", ")}가 설정되지 않았습니다.` },
      { status: 503 },
    );
  }

  try {
    return NextResponse.json(
      await searchLiveHospitalCandidates({
        nemcApiKey: NEMC_API_KEY!,
        kakaoApiKey: KAKAO_MOBILITY_REST_KEY!,
        location: parsed.data.location,
        treatmentCodes: parsed.data.treatmentCodes,
      }),
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "병원 후보 계산 중 알 수 없는 오류가 발생했습니다.",
      },
      { status: 502 },
    );
  }
}
