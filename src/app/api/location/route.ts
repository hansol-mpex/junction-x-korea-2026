import { NextResponse } from "next/server";
import { getServerEnv } from "@/lib/config/env";
import { resolveLocation } from "@/lib/transfer/location";
import { LocationRequestSchema } from "@/lib/transfer/schemas";

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

  const parsed = LocationRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "위치를 두 글자 이상 입력해 주세요.",
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }

  const { KAKAO_MOBILITY_REST_KEY } = getServerEnv();
  if (!KAKAO_MOBILITY_REST_KEY) {
    return NextResponse.json(
      { error: "KAKAO_MOBILITY_REST_KEY가 설정되지 않았습니다." },
      { status: 503 },
    );
  }

  try {
    return NextResponse.json(
      await resolveLocation({
        query: parsed.data.query,
        apiKey: KAKAO_MOBILITY_REST_KEY,
      }),
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "위치 확인 중 알 수 없는 오류가 발생했습니다.",
      },
      { status: 502 },
    );
  }
}
