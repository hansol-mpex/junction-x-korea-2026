"use client";

import type { RecommendationResponse } from "@/lib/domain/schemas";

export function SelectionFunnel({ result }: { result: RecommendationResponse }) {
  const total = Math.max(result.totalHospitals, 1);
  const steps = [
    { label: "반경 150km 응급기관", value: result.totalHospitals },
    { label: "역량 필터 통과", value: result.eligibleHospitals },
    { label: "제시된 후보", value: result.recommendations.length },
  ];

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>후보 선별 과정</h2>
        <span>{result.totalHospitals}곳이 어떻게 {result.recommendations.length}곳이 되었나</span>
      </div>
      <div className="panel-body">
        <div className="funnel">
          {steps.map((step, index) => (
            <div className="funnel-step" key={step.label}>
              <span>{step.label}</span>
              <div
                className={`funnel-bar step-${index}`}
                style={{
                  width: `${Math.max((step.value / total) * 100, 6)}%`,
                }}
              >
                {step.value}
              </div>
            </div>
          ))}
        </div>
        <p className="panel-note">
          <b>UNKNOWN·정보미제공은 가용으로 간주하지 않습니다.</b> 필수역량을 충족하지
          못한 병원은 AI 랭킹 입력에서 원천 제외되며, AI는 코드가 통과시킨 후보
          안에서만 순위를 정합니다.
        </p>
      </div>
    </section>
  );
}

export function DataLimitsPanel({
  result,
}: {
  result: RecommendationResponse;
}) {
  const { sourceStatus } = result;
  const routingLabel =
    sourceStatus.routing === "LIVE"
      ? "실경로"
      : sourceStatus.routing === "ESTIMATED"
        ? "직선거리 추정"
        : "조회 실패";

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>데이터 상태와 한계</h2>
      </div>
      <div className="panel-body">
        <div className="kv">
          <span>NEMC 응급의료기관 정보</span>
          <b className={sourceStatus.nemc === "LIVE" ? "tone-ok" : "tone-warn"}>
            {sourceStatus.nemc === "LIVE" ? "실시간" : "합성 스냅샷"}
          </b>
        </div>
        <div className="kv">
          <span>경로 산출</span>
          <b
            className={
              sourceStatus.routing === "LIVE" ? "tone-ok" : "tone-warn"
            }
          >
            {routingLabel}
          </b>
        </div>
        <div className="kv">
          <span>순위 산출</span>
          <b
            className={
              sourceStatus.ranking === "GEMINI" ? "tone-ok" : "tone-warn"
            }
          >
            {sourceStatus.ranking === "GEMINI"
              ? "Gemini · 스키마 검증 통과"
              : "결정론 폴백"}
          </b>
        </div>
        <p className="panel-note">
          국립중앙의료원 전국 응급의료기관 정보 조회 서비스 (data.go.kr / 15000563)
          <br />
          119구급상황관리센터 운영 현황 <b>2020년 기준</b> (data.go.kr / 15089564) —
          배경 설명용
          <br />
          <br />
          공개된 <b>Y</b> 값은 수용 확약이 아닙니다. 확인 위험 등급은 임상 수용
          확률이 아니라 데이터 경과시간·누락 정도에 기반합니다. 본 도구는 병원
          배정·의료행위를 대체하지 않습니다.
        </p>
      </div>
    </section>
  );
}
