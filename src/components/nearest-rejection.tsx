"use client";

import type { EvaluatedCandidate } from "@/lib/domain/schemas";

export function NearestRejection({
  candidate,
}: {
  candidate?: EvaluatedCandidate;
}) {
  if (!candidate) return null;

  return (
    <section className="rejection-panel">
      <div>
        <span className="section-kicker">WHY NOT THE NEAREST?</span>
        <h3>가까워도 최종치료가 끊기면 제외합니다</h3>
      </div>
      <div className="rejection-hospital">
        <strong>{candidate.hospital.name}</strong>
        <span>
          {candidate.route.durationMinutes}분 ·{" "}
          {candidate.route.distanceKm.toFixed(1)}km
        </span>
      </div>
      <div className="rejection-reasons">
        {candidate.rejectionReasons.map((reason) => (
          <span key={reason}>× {reason}</span>
        ))}
      </div>
    </section>
  );
}
