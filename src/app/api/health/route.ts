import { NextResponse } from "next/server";
import { getMissingServerKeys } from "@/lib/config/env";

export const runtime = "nodejs";

export function GET() {
  const missingKeys = getMissingServerKeys();
  return NextResponse.json({
    status: missingKeys.length === 0 ? "ready" : "degraded",
    missingKeys,
    demoAvailable: true,
    checkedAt: new Date().toISOString(),
  });
}
