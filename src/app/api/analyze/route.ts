import { NextResponse } from "next/server";
import { getServerEnv } from "@/lib/config/env";
import { analyzePatientNarrative } from "@/lib/transfer/analyze";
import { PatientAnalysisRequestSchema } from "@/lib/transfer/schemas";

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

  const parsed = PatientAnalysisRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "환자 상태를 두 글자 이상 입력해 주세요.",
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }

  const { GEMINI_API_KEY, GEMINI_MODEL } = getServerEnv();
  if (!GEMINI_API_KEY) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY가 설정되지 않았습니다." },
      { status: 503 },
    );
  }

  try {
    return NextResponse.json(
      await analyzePatientNarrative({
        apiKey: GEMINI_API_KEY,
        model: GEMINI_MODEL,
        narrative: parsed.data.narrative,
      }),
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "AI 분석 중 알 수 없는 오류가 발생했습니다.",
      },
      { status: 502 },
    );
  }
}
