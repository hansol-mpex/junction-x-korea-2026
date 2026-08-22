"use client";

import type { SourceStatus } from "@/lib/domain/schemas";

const statusLabel = {
  LIVE: "LIVE",
  SNAPSHOT: "SNAPSHOT",
  ERROR: "ERROR",
  ESTIMATED: "ESTIMATED",
  GEMINI: "GEMINI",
  DETERMINISTIC: "FALLBACK",
} as const;

export function SourceStatusBar({ status }: { status: SourceStatus }) {
  const formattedTime = new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(status.queriedAt));

  return (
    <div className="source-status">
      <div className="source-badges">
        <span className={`status-pill status-${status.nemc.toLowerCase()}`}>
          NEMC {statusLabel[status.nemc]}
        </span>
        <span className={`status-pill status-${status.routing.toLowerCase()}`}>
          ROUTE {statusLabel[status.routing]}
        </span>
        <span className={`status-pill status-${status.ranking.toLowerCase()}`}>
          RANK {statusLabel[status.ranking]}
        </span>
      </div>
      <span className="status-time">조회 {formattedTime}</span>
    </div>
  );
}
