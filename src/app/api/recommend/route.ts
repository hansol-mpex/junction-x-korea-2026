import { NextResponse } from "next/server";
import { IncidentInputSchema } from "@/lib/domain/schemas";
import { createRecommendation } from "@/lib/recommendation/service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = IncidentInputSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "입력값을 확인해 주세요.",
          issues: parsed.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
        { status: 400 },
      );
    }

    return NextResponse.json(await createRecommendation(parsed.data));
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "추천 처리 중 알 수 없는 오류가 발생했습니다.",
      },
      { status: 502 },
    );
  }
}
