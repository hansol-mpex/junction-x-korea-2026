"use client";

import { reasonCodeLabels } from "@/lib/domain/capabilities";
import type { RankedCandidate } from "@/lib/domain/schemas";

const riskLabels = { LOW: "낮음", CAUTION: "주의", HIGH: "높음" } as const;
const evidenceMark = { SATISFIED: "✓", FAILED: "✕", UNKNOWN: "?" } as const;

export function ComparisonTable({
  recommendations,
}: {
  recommendations: RankedCandidate[];
}) {
  if (recommendations.length === 0) return null;

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>후보 비교</h2>
        <span>동일 항목을 같은 행에서 직접 비교합니다</span>
        <span className="panel-head-right">
          적격 후보가 3곳 미만이면 임의로 채우지 않습니다
        </span>
      </div>

      <div className="compare-scroll">
        <table className="compare-table">
          <thead>
            <tr>
              <th className="row-label" />
              {recommendations.map((candidate) => (
                <th
                  key={candidate.hospital.hpid}
                  className={candidate.rank === 1 ? "best" : undefined}
                >
                  <div className="compare-rank">
                    <span className="rank-chip">{candidate.rank}</span>
                    <span className="compare-name">
                      {candidate.hospital.name}
                    </span>
                  </div>
                  <div className="compare-grade">
                    {candidate.hospital.emergencyClassName ?? "응급의료기관"} ·{" "}
                    {candidate.hospital.address}
                  </div>
                  <div className="compare-pills">
                    {candidate.hospital.isTraumaCenter && (
                      <span className="pill pill-trauma">외상센터</span>
                    )}
                    <span
                      className={
                        candidate.eligibility === "CONFIRMED"
                          ? "pill pill-ok"
                          : "pill pill-verify"
                      }
                    >
                      {candidate.eligibility === "CONFIRMED"
                        ? "역량 확인"
                        : "확인 필요"}
                    </span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th className="row-label">예상 도착</th>
              {recommendations.map((candidate) => (
                <td key={candidate.hospital.hpid}>
                  <div className="compare-big">
                    {candidate.route.durationMinutes}
                    <small>분</small>
                  </div>
                  <div className="compare-small">
                    {candidate.route.distanceKm.toFixed(1)} km ·{" "}
                    {candidate.route.mode === "LIVE" ? "실경로" : "추정"}
                  </div>
                </td>
              ))}
            </tr>

            <tr>
              <th className="row-label">최종치료 역량</th>
              {recommendations.map((candidate) => (
                <td key={candidate.hospital.hpid}>
                  <ul className="capability-evidence">
                    {candidate.capabilityEvidence.map((item) => (
                      <li
                        className={`evidence-${item.state.toLowerCase()}`}
                        key={item.code}
                      >
                        <span>{evidenceMark[item.state]}</span>
                        {item.detail}
                      </li>
                    ))}
                  </ul>
                </td>
              ))}
            </tr>

            <tr>
              <th className="row-label">데이터 신선도</th>
              {recommendations.map((candidate) => (
                <td key={candidate.hospital.hpid}>
                  <div className="compare-big">
                    {candidate.hospital.sourceAgeMinutes ?? "—"}
                    <small>분 전</small>
                  </div>
                  <div className="compare-small">
                    {candidate.hospital.sourceMode === "LIVE"
                      ? "NEMC 실시간"
                      : "합성 스냅샷"}
                  </div>
                </td>
              ))}
            </tr>

            <tr>
              <th className="row-label">확인 위험</th>
              {recommendations.map((candidate) => (
                <td key={candidate.hospital.hpid}>
                  <span
                    className={`risk-tag risk-${candidate.risk.toLowerCase()}`}
                  >
                    {riskLabels[candidate.risk]}
                  </span>
                  <div className="compare-small">
                    {candidate.riskReasons.join(" · ")}
                  </div>
                </td>
              ))}
            </tr>

            <tr>
              <th className="row-label">
                선정 근거
                <br />· 트레이드오프
              </th>
              {recommendations.map((candidate) => (
                <td key={candidate.hospital.hpid}>
                  <ul className="reason-list">
                    {candidate.reasonCodes.map((code) => (
                      <li className="positive" key={code}>
                        {reasonCodeLabels[code]}
                      </li>
                    ))}
                    {candidate.tradeoffCodes.map((code) => (
                      <li className="caution" key={code}>
                        {reasonCodeLabels[code]}
                      </li>
                    ))}
                  </ul>
                </td>
              ))}
            </tr>

            <tr>
              <th className="row-label">수용 확인</th>
              {recommendations.map((candidate) => (
                <td key={candidate.hospital.hpid}>
                  {candidate.hospital.erPhone ? (
                    <a
                      className={
                        candidate.rank === 1 ? "tel-button best" : "tel-button"
                      }
                      href={`tel:${candidate.hospital.erPhone}`}
                    >
                      {candidate.hospital.erPhone}
                    </a>
                  ) : (
                    <span className="tel-button disabled">전화 미제공</span>
                  )}
                  <div className="compare-small centered">
                    이송 전 수용 확인 필수
                  </div>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}
