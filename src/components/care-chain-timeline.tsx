"use client";

import { useMemo } from "react";
import {
  buildCareChainTimeline,
  timelineAssumptions,
  type TimelineSegment,
} from "@/lib/domain/timeline";
import type {
  EvaluatedCandidate,
  RankedCandidate,
} from "@/lib/domain/schemas";

const segmentLegend = [
  { kind: "TRANSPORT", label: "이송" },
  { kind: "EMERGENCY", label: "응급실·소생실" },
  { kind: "IMAGING", label: "영상검사" },
  { kind: "SURGERY", label: "수술" },
  { kind: "ICU", label: "중환자실" },
  { kind: "BLOCKED", label: "역량 미충족" },
  { kind: "UNVERIFIED", label: "정보미제공" },
  { kind: "RETRANSFER", label: "재전원" },
] as const;

function percent(value: number, max: number) {
  return `${(value / max) * 100}%`;
}

function SegmentBar({
  item,
  axisMaxMinute,
}: {
  item: TimelineSegment;
  axisMaxMinute: number;
}) {
  const width = item.endMinute - item.startMinute;
  return (
    <span
      className={`chain-segment segment-${item.kind.toLowerCase()}`}
      style={{
        left: percent(item.startMinute, axisMaxMinute),
        width: percent(width, axisMaxMinute),
      }}
      title={`${item.label} · ${Math.round(item.startMinute)}~${Math.round(
        item.endMinute,
      )}분`}
    >
      {item.label}
    </span>
  );
}

export function CareChainTimeline({
  recommendations,
  nearestRejected,
}: {
  recommendations: RankedCandidate[];
  nearestRejected?: EvaluatedCandidate;
}) {
  const timeline = useMemo(
    () => buildCareChainTimeline({ recommendations, nearestRejected }),
    [recommendations, nearestRejected],
  );

  if (timeline.lanes.length === 0) return null;

  const { axisMaxMinute } = timeline;

  return (
    <section className="panel chain-panel">
      <div className="panel-head">
        <h2>최종치료 연속성 타임라인</h2>
        <span>사고 시점부터 수술 시작까지, 후보별 치료 사슬이 어디서 끊기는지 비교</span>
        <span className="panel-head-right">가로축 = 사고 발생 후 경과분</span>
      </div>

      <div className="chain-body">
        <div className="chain-axis">
          {timeline.axisTicks.map((tick) => (
            <span
              className="chain-tick"
              key={tick}
              style={{ left: percent(tick, axisMaxMinute) }}
            >
              {tick === 0
                ? "0분"
                : tick === timeline.axisTicks.at(-1)
                  ? `${tick}분`
                  : tick}
            </span>
          ))}
        </div>

        {timeline.lanes.map((lane) => (
          <div className={`chain-lane tone-${lane.tone.toLowerCase()}`} key={lane.id}>
            <div className="chain-who">
              <div className="chain-name">
                <span>{lane.name}</span>
                <em>{lane.badge}</em>
              </div>
              <div className="chain-sub">{lane.subtitle}</div>
            </div>
            <div className="chain-track">
              {lane.segments.map((item) => (
                <SegmentBar
                  item={item}
                  axisMaxMinute={axisMaxMinute}
                  key={`${lane.id}-${item.kind}-${item.startMinute}`}
                />
              ))}
              {lane.breakLabel && (
                <span
                  className="chain-flag"
                  style={{
                    left: percent(
                      lane.segments.find(
                        (item) =>
                          item.kind === "BLOCKED" || item.kind === "UNVERIFIED",
                      )?.startMinute ?? 0,
                      axisMaxMinute,
                    ),
                  }}
                >
                  {lane.tone === "REJECTED" ? "✕" : "?"} {lane.breakLabel}
                </span>
              )}
              {lane.surgeryStartMinute != null && (
                <span
                  className="chain-mark"
                  style={{
                    left: percent(lane.surgeryStartMinute, axisMaxMinute),
                  }}
                >
                  수술 시작 {Math.round(lane.surgeryStartMinute)}분
                  {lane.tone === "PRIMARY" && " · 단절 없음"}
                </span>
              )}
            </div>
          </div>
        ))}

        <div className="chain-legend">
          {segmentLegend.map((item) => (
            <span key={item.kind}>
              <i className={`segment-${item.kind.toLowerCase()}`} />
              {item.label}
            </span>
          ))}
        </div>
      </div>

      {timeline.detourDelayMinutes != null && timeline.detourDelayMinutes > 0 && (
        <div className="chain-insight">
          <div className="chain-insight-number">
            +{timeline.detourDelayMinutes}
            <small>분</small>
          </div>
          <div>
            <strong>
              가장 가까운 병원을 경유하면 수술 시작이{" "}
              {timeline.detourDelayMinutes}분 늦어집니다.
            </strong>
            <p>
              {nearestRejected?.hospital.name}은(는) 응급실 진입은 가능하지만{" "}
              {nearestRejected?.rejectionReasons.slice(0, 3).join(" · ")}(으)로
              최종치료가 연결되지 않아 재전원이 필요합니다. 더 이동하더라도 최종치료
              가능한 병원으로 직접 이송하는 편이 치료 사슬을 유지합니다.
            </p>
          </div>
        </div>
      )}

      <p className="chain-disclaimer">
        ※ 이송시간은 경로 API 또는 직선거리 기반 추정치입니다. 병원 내 처치·전원준비
        시간은 비교를 위한 <b>도식용 고정 가정값</b>(응급실 평가{" "}
        {timelineAssumptions.erAssessmentMinutes}분 / 전원 준비{" "}
        {timelineAssumptions.transferPrepMinutes}분 / 도착 후 수술 준비{" "}
        {timelineAssumptions.resuscitationMinutes +
          timelineAssumptions.imagingMinutes}
        분)이며 실제 소요시간이 아닙니다. 본 타임라인은 임상적 예후 예측이 아니라 공개
        데이터의 역량 단절 지점을 시각화한 것입니다.
      </p>
    </section>
  );
}
