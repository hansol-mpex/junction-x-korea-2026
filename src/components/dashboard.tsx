"use client";

import { useCallback, useEffect, useState } from "react";
import { demoIncident } from "@/data/demo";
import {
  capabilityCodes,
  capabilityLabels,
  type CapabilityCode,
  type IncidentInput,
  type RecommendationResponse,
} from "@/lib/domain/schemas";
import { CareChainTimeline } from "./care-chain-timeline";
import { ComparisonTable } from "./comparison-table";
import { NearestRejection } from "./nearest-rejection";
import { RecommendationCard } from "./recommendation-card";
import { DataLimitsPanel, SelectionFunnel } from "./selection-funnel";
import { SourceStatusBar } from "./source-status";

const locationPresets = [
  {
    name: "영양군 입암면",
    address: "경상북도 영양군 입암면 (합성 사고지점)",
    lat: 36.593,
    lng: 129.09,
  },
  {
    name: "봉화군 춘양면",
    address: "경상북도 봉화군 춘양면 (합성 사고지점)",
    lat: 36.938,
    lng: 128.915,
  },
  {
    name: "청송군 진보면",
    address: "경상북도 청송군 진보면 (합성 사고지점)",
    lat: 36.529,
    lng: 129.046,
  },
  {
    name: "울진군 금강송면",
    address: "경상북도 울진군 금강송면 (합성 사고지점)",
    lat: 36.934,
    lng: 129.245,
  },
] as const;

const mechanismLabels = {
  FALL: "추락",
  TRAFFIC: "교통사고",
  CRUSH: "압궤",
  PENETRATING: "관통상",
  OTHER: "기타",
} as const;

const consciousnessLabels = {
  ALERT: "A 명료",
  VOICE: "V 음성반응",
  PAIN: "P 통증반응",
  UNRESPONSIVE: "U 무반응",
} as const;

const tabs = [
  { id: "timeline", label: "치료 연속성" },
  { id: "compare", label: "후보 비교" },
  { id: "detail", label: "후보 상세" },
] as const;

type TabId = (typeof tabs)[number]["id"];

const vitalFields = [
  { key: "systolicBp", label: "SBP" },
  { key: "heartRate", label: "HR" },
  { key: "spo2", label: "SpO₂" },
] as const;

function numericValue(value: string) {
  return value === "" ? null : Number(value);
}

export function Dashboard() {
  const [incident, setIncident] = useState<IncidentInput>(demoIncident);
  const [result, setResult] = useState<RecommendationResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<TabId>("timeline");

  const runRecommendation = useCallback(async (payload: IncidentInput) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "추천 요청에 실패했습니다.");
      }
      setResult(data as RecommendationResponse);
    } catch (requestError) {
      setResult(null);
      setError(
        requestError instanceof Error
          ? requestError.message
          : "추천 요청에 실패했습니다.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // 첫 진입 시 데모 시나리오를 자동 실행한다. 커밋 직후로 미뤄
    // 이펙트 본문에서 동기적으로 상태를 바꾸지 않도록 한다.
    const timer = setTimeout(() => void runRecommendation(demoIncident), 0);
    return () => clearTimeout(timer);
  }, [runRecommendation]);

  // 발표 중 특정 화면으로 바로 이동할 수 있도록 해시로 탭을 선택한다.
  // 하이드레이션 불일치를 피하기 위해 마운트 이후에만 반영한다.
  useEffect(() => {
    const applyHash = () => {
      const target = window.location.hash.replace("#", "");
      if (tabs.some((item) => item.id === target)) {
        setTab(target as TabId);
      }
    };
    applyHash();
    window.addEventListener("hashchange", applyHash);
    return () => window.removeEventListener("hashchange", applyHash);
  }, []);

  function toggleCapability(code: CapabilityCode) {
    setIncident((current) => ({
      ...current,
      requiredCapabilities: current.requiredCapabilities.includes(code)
        ? current.requiredCapabilities.filter((item) => item !== code)
        : [...current.requiredCapabilities, code],
    }));
  }

  return (
    <div className="app">
      <form
        className="topbar"
        onSubmit={(event) => {
          event.preventDefault();
          void runRecommendation(incident);
        }}
      >
        <div className="brand">
          <i aria-hidden />
          <strong>직결119</strong>
          <em>경상북도 중증외상 최종치료 연결</em>
        </div>

        <div className="field">
          <label htmlFor="loc">현장</label>
          <select
            id="loc"
            value={incident.location.address}
            onChange={(event) => {
              const preset = locationPresets.find(
                (item) => item.address === event.target.value,
              );
              if (!preset) return;
              setIncident((current) => ({
                ...current,
                location: {
                  ...current.location,
                  address: preset.address,
                  lat: preset.lat,
                  lng: preset.lng,
                },
              }));
            }}
          >
            {locationPresets.map((preset) => (
              <option value={preset.address} key={preset.address}>
                {preset.name}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label>pre-KTAS</label>
          <div className="ktas" role="group" aria-label="pre-KTAS 등급">
            {(["1", "2", "3"] as const).map((level) => (
              <button
                type="button"
                key={level}
                className={incident.preKtas === level ? "on" : undefined}
                aria-pressed={incident.preKtas === level}
                onClick={() =>
                  setIncident((current) => ({ ...current, preKtas: level }))
                }
              >
                {level}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label htmlFor="mech">기전</label>
          <select
            id="mech"
            value={incident.mechanism}
            onChange={(event) =>
              setIncident((current) => ({
                ...current,
                mechanism: event.target.value as IncidentInput["mechanism"],
              }))
            }
          >
            {Object.entries(mechanismLabels).map(([value, label]) => (
              <option value={value} key={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="cons">의식</label>
          <select
            id="cons"
            value={incident.vitals.consciousness}
            onChange={(event) =>
              setIncident((current) => ({
                ...current,
                vitals: {
                  ...current.vitals,
                  consciousness: event.target
                    .value as IncidentInput["vitals"]["consciousness"],
                },
              }))
            }
          >
            {Object.entries(consciousnessLabels).map(([value, label]) => (
              <option value={value} key={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        {vitalFields.map((vital) => (
          <div className="field" key={vital.key}>
            <label htmlFor={vital.key}>{vital.label}</label>
            <input
              id={vital.key}
              className="narrow"
              type="number"
              inputMode="numeric"
              value={incident.vitals[vital.key] ?? ""}
              onChange={(event) =>
                setIncident((current) => ({
                  ...current,
                  vitals: {
                    ...current.vitals,
                    [vital.key]: numericValue(event.target.value),
                  },
                }))
              }
            />
          </div>
        ))}

        <button
          className="run"
          type="submit"
          disabled={loading || incident.requiredCapabilities.length === 0}
        >
          {loading ? "분석 중…" : "탐색"}
        </button>

        <label className="demo-toggle">
          <input
            type="checkbox"
            checked={incident.useDemoData}
            onChange={(event) =>
              setIncident((current) => ({
                ...current,
                useDemoData: event.target.checked,
              }))
            }
          />
          <span>합성 스냅샷</span>
        </label>

        {result && <SourceStatusBar status={result.sourceStatus} />}
      </form>

      <div className="capbar">
        <span className="capbar-label">필요 최종치료 역량</span>
        {capabilityCodes.map((code) => {
          const active = incident.requiredCapabilities.includes(code);
          return (
            <button
              type="button"
              key={code}
              className={active ? "chip on" : "chip add"}
              aria-pressed={active}
              onClick={() => toggleCapability(code)}
            >
              {active ? capabilityLabels[code] : `+ ${capabilityLabels[code]}`}
            </button>
          );
        })}
        <span className="capbar-meta">
          {result
            ? `검토 ${result.totalHospitals}곳 · 역량통과 ${result.eligibleHospitals}곳`
            : "대기 중"}
        </span>
      </div>

      <main className="main">
        {error && (
          <div className="error-banner" role="alert">
            <strong>추천을 완료하지 못했습니다.</strong>
            <span>{error}</span>
          </div>
        )}

        {result && result.sourceStatus.warnings.length > 0 && (
          <details className="warning-panel">
            <summary>
              데이터·추천 경고 {result.sourceStatus.warnings.length}건
            </summary>
            <ul>
              {result.sourceStatus.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </details>
        )}

        {result && (
          <>
            <nav className="tabs" role="tablist">
              {tabs.map((item) => (
                <button
                  type="button"
                  role="tab"
                  key={item.id}
                  aria-selected={tab === item.id}
                  className={tab === item.id ? "on" : undefined}
                  onClick={() => {
                    setTab(item.id);
                    window.location.hash = item.id;
                  }}
                >
                  {item.label}
                </button>
              ))}
            </nav>

            {result.recommendations.length === 0 ? (
              <div className="empty-result">
                조건을 충족하는 병원을 확인하지 못했습니다. 필수역량과 데이터
                경고를 검토하고 광역상황실 절차를 따르세요.
              </div>
            ) : (
              <>
                {tab === "timeline" && (
                  <>
                    <CareChainTimeline
                      recommendations={result.recommendations}
                      nearestRejected={result.nearestRejected}
                    />
                    <NearestRejection candidate={result.nearestRejected} />
                  </>
                )}

                {tab === "compare" && (
                  <ComparisonTable recommendations={result.recommendations} />
                )}

                {tab === "detail" && (
                  <div className="card-list">
                    {result.recommendations.map((candidate) => (
                      <RecommendationCard
                        candidate={candidate}
                        key={candidate.hospital.hpid}
                      />
                    ))}
                  </div>
                )}
              </>
            )}

            <div className="bottom-grid">
              <SelectionFunnel result={result} />
              <DataLimitsPanel result={result} />
            </div>
          </>
        )}
      </main>
    </div>
  );
}
