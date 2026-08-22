"use client";

import { reasonCodeLabels } from "@/lib/domain/capabilities";
import type { RankedCandidate } from "@/lib/domain/schemas";

const riskLabels = {
  LOW: "낮음",
  CAUTION: "주의",
  HIGH: "높음",
} as const;

export function RecommendationCard({
  candidate,
}: {
  candidate: RankedCandidate;
}) {
  const { hospital, route } = candidate;
  const verified = candidate.eligibility === "CONFIRMED";

  return (
    <article className={`recommendation-card rank-${candidate.rank}`}>
      <div className="recommendation-heading">
        <div className="rank-marker">{candidate.rank}</div>
        <div>
          <div className="hospital-meta">
            <span>{hospital.emergencyClassName ?? "응급의료기관"}</span>
            {hospital.isTraumaCenter && <strong>외상센터</strong>}
          </div>
          <h3>{hospital.name}</h3>
          <p>{hospital.address}</p>
        </div>
        <span className={`risk-badge risk-${candidate.risk.toLowerCase()}`}>
          확인 위험 {riskLabels[candidate.risk]}
        </span>
      </div>

      <div className="metric-grid">
        <div>
          <span>예상 도착</span>
          <strong>{route.durationMinutes}분</strong>
          <small>{route.mode === "LIVE" ? "실경로" : "거리 추정"}</small>
        </div>
        <div>
          <span>이동 거리</span>
          <strong>{route.distanceKm.toFixed(1)}km</strong>
          <small>육로</small>
        </div>
        <div>
          <span>필수역량</span>
          <strong>
            {
              candidate.capabilityEvidence.filter(
                (item) => item.state === "SATISFIED",
              ).length
            }
            /{candidate.capabilityEvidence.length}
          </strong>
          <small>{verified ? "확인" : "추가 확인"}</small>
        </div>
        <div>
          <span>업데이트</span>
          <strong>
            {hospital.sourceAgeMinutes === undefined
              ? "미상"
              : `${hospital.sourceAgeMinutes}분 전`}
          </strong>
          <small>{hospital.sourceMode}</small>
        </div>
      </div>

      <div className="reason-stack">
        {candidate.reasonCodes.map((code) => (
          <div className="reason-item positive" key={code}>
            <span>✓</span>
            {reasonCodeLabels[code]}
          </div>
        ))}
        {candidate.tradeoffCodes.map((code) => (
          <div className="reason-item caution" key={code}>
            <span>!</span>
            {reasonCodeLabels[code]}
          </div>
        ))}
      </div>

      <details className="evidence-details">
        <summary>역량 근거와 데이터 위험 보기</summary>
        <div className="evidence-list">
          {candidate.capabilityEvidence.map((evidence) => (
            <span
              className={`evidence evidence-${evidence.state.toLowerCase()}`}
              key={evidence.code}
            >
              {evidence.detail}
            </span>
          ))}
        </div>
        <ul>
          {candidate.riskReasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      </details>

      <div className="card-actions">
        {hospital.erPhone ? (
          <a href={`tel:${hospital.erPhone}`}>응급실 {hospital.erPhone}</a>
        ) : (
          <span>응급실 전화 미제공</span>
        )}
        <strong>이송 전 수용 확인 필수</strong>
      </div>
    </article>
  );
}
