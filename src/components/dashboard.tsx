"use client";

import Image from "next/image";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  PostcodeSearch,
  type PostcodeSelection,
} from "@/components/postcode-search";
import type { TreatmentAreaCode } from "@/lib/transfer/catalog";
import { buildTransferSummaryText } from "@/lib/transfer/summary";
import type {
  AcceptanceState,
  HospitalCandidate,
  HospitalHistoryEvidence,
  HospitalSearchResponse,
  HistoricalTreatmentEvidence,
  ResolvedLocation,
  TreatmentAnalysis,
} from "@/lib/transfer/schemas";

type Step = 1 | 2 | 3 | 4;
type Filter = "priority" | "all";
type CopyState = "idle" | "success" | "error";

interface LoadingState {
  kicker: string;
  title: string;
  labels: string[];
  phase: number;
  elapsedSeconds: number;
}

const steps = [
  { step: 1, number: "01", label: "위치 확인" },
  { step: 2, number: "02", label: "환자 상태 설명" },
  { step: 3, number: "03", label: "필요 치료영역" },
  { step: 4, number: "04", label: "병원 후보 선정" },
] as const;

const stateMeta: Record<
  AcceptanceState,
  { label: string; className: string }
> = {
  CONFIRMED: { label: "처치 가능", className: "confirmed" },
  VERIFY_REQUIRED: { label: "확인 필요", className: "verify" },
  REPORTED_UNAVAILABLE: { label: "처치 불가", className: "unavailable" },
};

async function postJson<T>(url: string, body: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });
  } catch (error) {
    if (
      error instanceof DOMException &&
      (error.name === "TimeoutError" || error.name === "AbortError")
    ) {
      throw new Error("응답 시간이 초과되었습니다. 다시 시도해 주세요.");
    }
    throw error;
  }
  const payload = (await response.json()) as { error?: string } & T;
  if (!response.ok) {
    throw new Error(payload.error || "요청 처리에 실패했습니다.");
  }
  return payload;
}

function formatHvidate(value: string | null) {
  if (!value || !/^\d{14}$/.test(value)) return "기준시각 정보미제공";
  return `${value.slice(0, 4)}.${value.slice(4, 6)}.${value.slice(
    6,
    8,
  )} ${value.slice(8, 10)}:${value.slice(10, 12)}:${value.slice(12, 14)}`;
}

function formatClock(date: Date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes(),
  ).padStart(2, "0")}`;
}

const historyTimeFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const summaryTimeFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

function formatHistoryTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "시각 정보미제공"
    : historyTimeFormatter.format(date);
}

function formatSummaryTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "시각 정보미제공"
    : summaryTimeFormatter.format(date);
}

function formatHistoryState(value: "Y" | "UNAVAILABLE" | "UNKNOWN") {
  if (value === "Y") return "가능(Y)";
  if (value === "UNAVAILABLE") return "불가능";
  return "정보미제공";
}

function interpretHistory(treatment: HistoricalTreatmentEvidence): {
  label: string;
  description: string;
  tone: "good" | "warning" | "bad" | "neutral";
} {
  if (treatment.observationCount < 3) {
    return {
      label: "관측 부족",
      description: "표본이 적어 아직 경향을 판단할 수 없습니다.",
      tone: "neutral",
    };
  }
  if (treatment.lastObservedState === "UNAVAILABLE") {
    return {
      label: "최근 불가능 보고",
      description: "마지막 과거 관측값이 불가능이므로 현재 상태를 확인하세요.",
      tone: "bad",
    };
  }
  if (
    treatment.lastObservedState === "UNKNOWN" ||
    treatment.unknownPercent >= 50
  ) {
    return {
      label: "정보 확인 우선",
      description: "정보미제공 비중이 높아 병원 확인이 특히 중요합니다.",
      tone: "warning",
    };
  }
  if (treatment.transitionCount >= 3) {
    return {
      label: "상태 변동 있음",
      description: "관측 기간 중 보고값이 여러 번 바뀌었습니다.",
      tone: "warning",
    };
  }
  if (treatment.yPercent >= 80) {
    return {
      label: "가능 보고가 안정적",
      description: "과거 관측 대부분에서 병원이 가능(Y)으로 보고했습니다.",
      tone: "good",
    };
  }
  if (treatment.yPercent >= 50) {
    return {
      label: "가능 보고가 더 많음",
      description: "가능(Y) 보고가 절반 이상이지만 현재 상태 확인은 필요합니다.",
      tone: "neutral",
    };
  }
  return {
    label: "가능 보고가 드묾",
    description: "과거 가능(Y) 보고 비중이 낮아 병원 확인을 우선하세요.",
    tone: "warning",
  };
}

function ErrorNotice({
  message,
  onRetry,
  onClose,
}: {
  message: string;
  onRetry: () => void;
  onClose: () => void;
}) {
  return (
    <div className="error-notice" role="alert">
      <div>
        <span>요청 실패</span>
        <strong>{message}</strong>
      </div>
      <div className="error-actions">
        <button type="button" onClick={onRetry}>
          다시 시도
        </button>
        <button type="button" onClick={onClose}>
          닫기
        </button>
      </div>
    </div>
  );
}

function ScreenHeader({
  kicker,
  title,
  children,
}: {
  kicker: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <header className="screen-header">
      <span className="screen-kicker">{kicker}</span>
      <h1>{title}</h1>
      <p>{children}</p>
    </header>
  );
}

export function Dashboard() {
  const [step, setStep] = useState<Step>(1);
  const [maxStep, setMaxStep] = useState<Step>(1);
  const [clock, setClock] = useState("");
  const [placeQuery, setPlaceQuery] = useState("");
  const [locationQuery, setLocationQuery] = useState("");
  const [zonecode, setZonecode] = useState("");
  const [location, setLocation] = useState<ResolvedLocation | null>(null);
  const [patientNarrative, setPatientNarrative] = useState("");
  const [analysis, setAnalysis] = useState<TreatmentAnalysis | null>(null);
  const [selectedCodes, setSelectedCodes] = useState<TreatmentAreaCode[]>([]);
  const [hospitalResult, setHospitalResult] =
    useState<HospitalSearchResponse | null>(null);
  const [filter, setFilter] = useState<Filter>("priority");
  const [activeHospitalId, setActiveHospitalId] = useState<string | null>(null);
  const [selectedHospitalId, setSelectedHospitalId] = useState<string | null>(
    null,
  );
  const [selectedHospitalAt, setSelectedHospitalAt] = useState<string | null>(
    null,
  );
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [summaryCopyState, setSummaryCopyState] =
    useState<CopyState>("idle");
  const [loading, setLoading] = useState<LoadingState | null>(null);
  const [error, setError] = useState("");
  const retryRef = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    const update = () => setClock(formatClock(new Date()));
    update();
    const timer = window.setInterval(update, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const visibleCandidates = useMemo(() => {
    const candidates = hospitalResult?.candidates ?? [];
    return filter === "all"
      ? candidates
      : candidates.filter(
          (candidate) => candidate.state !== "REPORTED_UNAVAILABLE",
        );
  }, [filter, hospitalResult]);

  const resolvedActiveHospitalId = visibleCandidates.some(
    (candidate) => candidate.hpid === activeHospitalId,
  )
    ? activeHospitalId
    : (visibleCandidates[0]?.hpid ?? null);
  const activeHospital =
    hospitalResult?.candidates.find(
      (candidate) => candidate.hpid === resolvedActiveHospitalId,
    ) ?? null;
  const selectedHospital =
    hospitalResult?.candidates.find(
      (candidate) => candidate.hpid === selectedHospitalId,
    ) ?? null;

  function clearHospitalSelection() {
    setSelectedHospitalId(null);
    setSelectedHospitalAt(null);
    setSummaryOpen(false);
    setSummaryCopyState("idle");
  }

  function confirmHospitalSelection(hospital: HospitalCandidate) {
    setSelectedHospitalId(hospital.hpid);
    setSelectedHospitalAt((current) =>
      selectedHospitalId === hospital.hpid && current
        ? current
        : new Date().toISOString(),
    );
    setSummaryCopyState("idle");
    setSummaryOpen(true);
  }

  async function copyTransferSummary() {
    if (!selectedHospital || !selectedHospitalAt || !location) {
      setSummaryCopyState("error");
      return;
    }

    const meta = stateMeta[selectedHospital.state];
    const text = buildTransferSummaryText({
      selectedAt: formatSummaryTime(selectedHospitalAt),
      location: location.address,
      patientNarrative: patientNarrative.trim(),
      treatments: selectedHospital.treatments
        .map((treatment) => treatment.label)
        .join(", "),
      hospitalName: selectedHospital.name,
      hospitalState: `${meta.label} / ${selectedHospital.stateReason}`,
      route: `${selectedHospital.route.durationMinutes}분 / ${selectedHospital.route.distanceKm.toFixed(
        1,
      )}km`,
      beds:
        selectedHospital.hvec === null
          ? "정보미제공"
          : `응급실 ${selectedHospital.hvec}병상`,
      dataTimestamp: formatHvidate(selectedHospital.hvidate),
      phone: selectedHospital.phone,
    });

    try {
      if (!navigator.clipboard) {
        throw new Error("클립보드 API를 사용할 수 없습니다.");
      }
      await navigator.clipboard.writeText(text);
      setSummaryCopyState("success");
    } catch {
      setSummaryCopyState("error");
    }
  }

  async function withLoading<T>({
    kicker,
    title,
    labels,
    task,
  }: {
    kicker: string;
    title: string;
    labels: string[];
    task: () => Promise<T>;
  }) {
    setLoading({ kicker, title, labels, phase: 0, elapsedSeconds: 0 });
    const timer = window.setInterval(() => {
      setLoading((current) => {
        if (!current) return current;
        const elapsedSeconds = current.elapsedSeconds + 1;
        return {
          ...current,
          elapsedSeconds,
          phase: Math.min(
            current.labels.length - 1,
            Math.floor(elapsedSeconds / 4),
          ),
        };
      });
    }, 1_000);

    try {
      return await task();
    } finally {
      window.clearInterval(timer);
      setLoading(null);
    }
  }

  async function runAction(action: () => Promise<void>) {
    retryRef.current = action;
    setError("");
    try {
      await action();
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "알 수 없는 오류가 발생했습니다.",
      );
    }
  }

  async function searchLocation({
    query,
    displayName = "",
    selectedAddress,
  }: {
    query: string;
    displayName?: string;
    selectedAddress?: string;
  }) {
    const resolved = await withLoading({
      kicker: "위치 확인",
      title: "선택한 위치를 확인하고 있습니다…",
      labels: ["위치 검색 중", "좌표 확인 중"],
      task: () =>
        postJson<ResolvedLocation>("/api/location", {
          query,
        }),
    });
    const address = selectedAddress || resolved.address;
    setLocationQuery(address);
    setLocation({
      ...resolved,
      query,
      address,
      name: displayName || resolved.name,
    });
  }

  async function searchPlace() {
    const query = placeQuery.trim();
    if (query.length < 2) {
      throw new Error("건물명이나 장소명을 두 글자 이상 입력해 주세요.");
    }
    resetLocation("");
    await searchLocation({ query });
  }

  function continueFromLocation() {
    if (!location) return;
    setMaxStep((current) => Math.max(current, 2) as Step);
    setStep(2);
  }

  async function analyzePatient() {
    if (patientNarrative.trim().length < 2) {
      throw new Error("환자 상태를 두 글자 이상 입력해 주세요.");
    }
    const result = await withLoading({
      kicker: "환자 상태 분석",
      title: "환자 상태를 분석하고 있습니다…",
      labels: ["설명 해석 중", "공식 치료영역 대조 중", "원문 근거 검증 중"],
      task: () =>
        postJson<TreatmentAnalysis>("/api/analyze", {
          narrative: patientNarrative,
        }),
    });
    setAnalysis(result);
    setSelectedCodes([]);
    setMaxStep((current) => Math.max(current, 3) as Step);
    setStep(3);
  }

  async function findHospitals() {
    if (!location) throw new Error("확인된 신고 위치가 없습니다.");
    const result = await withLoading({
      kicker: "병원 후보 계산",
      title: "이송할 병원 후보를 계산하고 있습니다…",
      labels: [
        "NEMC 수용정보 조회 중",
        "치료영역 상태 판정 중",
        "Kakao 이동시간 계산 중",
        "후보 정렬 중",
      ],
      task: () =>
        postJson<HospitalSearchResponse>("/api/hospitals", {
          location,
          treatmentCodes: selectedCodes,
        }),
    });
    setHospitalResult(result);
    setFilter("priority");
    setActiveHospitalId(result.candidates[0]?.hpid ?? null);
    clearHospitalSelection();
    setMaxStep(4);
    setStep(4);
  }

  function resetLocation(nextQuery: string, nextZonecode = "") {
    setLocationQuery(nextQuery);
    setZonecode(nextZonecode);
    setLocation(null);
    setAnalysis(null);
    setSelectedCodes([]);
    setHospitalResult(null);
    setActiveHospitalId(null);
    clearHospitalSelection();
    setMaxStep(1);
  }

  function selectRoadAddress(selection: PostcodeSelection) {
    setPlaceQuery("");
    resetLocation(selection.address, selection.zonecode);
    void runAction(() =>
      searchLocation({
        query: selection.address,
        displayName: selection.buildingName,
        selectedAddress: selection.address,
      }),
    );
  }

  function resetPatient(nextNarrative: string) {
    setPatientNarrative(nextNarrative);
    setAnalysis(null);
    setSelectedCodes([]);
    setHospitalResult(null);
    setActiveHospitalId(null);
    clearHospitalSelection();
    setMaxStep(2);
  }

  function toggleTreatment(code: TreatmentAreaCode) {
    setSelectedCodes((current) =>
      current.includes(code)
        ? current.filter((item) => item !== code)
        : [...current, code],
    );
    setHospitalResult(null);
    setActiveHospitalId(null);
    clearHospitalSelection();
    setMaxStep(3);
  }

  const caseSummary = (() => {
    if (selectedHospital) {
      return {
        title: "선택 완료",
        detail: selectedHospital.name,
      };
    }
    if (step === 1) {
      return { title: "접수 전", detail: "신고 위치 미확인" };
    }
    if (step === 2) {
      return {
        title: "위치 확인",
        detail: location?.name || location?.address || "확인 완료",
      };
    }
    if (step === 3) {
      return {
        title: "AI 분석 완료",
        detail: "치료영역을 직접 선택해 주세요",
      };
    }
    return {
      title: "병원 후보 검토",
      detail: `${selectedCodes.length}개 치료영역 기준`,
    };
  })();

  return (
    <div className="console">
      <header className="topbar">
        <div className="brand">
          <Image
            className="brand-logo"
            src="/eunggeupsillo-arrow-wordmark.svg"
            alt="응급실로"
            width={220}
            height={72}
            priority
          />
        </div>
        <div className="topbar-main">
          <span>119 이송병원 조회</span>
          <time className="topbar-time">{clock}</time>
        </div>
      </header>

      <div className="workspace">
        <aside className="rail">
          <div className="case-summary">
            <span>현재 접수</span>
            <strong>{caseSummary.title}</strong>
            <p>{caseSummary.detail}</p>
          </div>
          <nav aria-label="처리 단계">
            {steps.map((item) => (
              <button
                type="button"
                key={item.step}
                className={[
                  "step-button",
                  step === item.step ? "active" : "",
                  item.step < maxStep ? "done" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                disabled={item.step > maxStep}
                onClick={() => setStep(item.step)}
              >
                <span>{item.number}</span>
                <strong>{item.label}</strong>
              </button>
            ))}
          </nav>
          <div className="rail-spacer" />
        </aside>

        <main className="main">
          {error && (
            <ErrorNotice
              message={error}
              onRetry={() => void retryRef.current?.()}
              onClose={() => setError("")}
            />
          )}

          <section className={`screen ${step === 1 ? "active" : ""}`}>
            <ScreenHeader
              kicker="신고 위치"
              title="환자가 있는 위치는 어디인가요?"
            >
              장소명으로 바로 찾거나 도로명주소를 검색할 수 있습니다.
            </ScreenHeader>
            <div className="screen-body">
              <div className="form-column">
                <div className="location-method">
                  <label htmlFor="place-query">건물명 또는 장소명</label>
                  <div className="place-search-row">
                    <input
                      id="place-query"
                      value={placeQuery}
                      onChange={(event) => setPlaceQuery(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !loading) {
                          void runAction(searchPlace);
                        }
                      }}
                      placeholder="예: 포항공대, 포항역, 포항시청"
                      autoComplete="off"
                    />
                    <button
                      type="button"
                      disabled={Boolean(loading)}
                      onClick={() => void runAction(searchPlace)}
                    >
                      장소명 검색
                    </button>
                  </div>
                </div>
                <div className="location-method-divider">
                  <span>또는</span>
                </div>
                <div className="location-method">
                  <span className="location-method-label">도로명주소</span>
                  <PostcodeSearch
                    disabled={Boolean(loading)}
                    onSelect={selectRoadAddress}
                  />
                </div>
                {location && (
                  <>
                    <label className="selected-location-label" htmlFor="location">
                      선택한 위치
                    </label>
                    <input
                      id="location"
                      value={locationQuery}
                      readOnly
                      autoComplete="off"
                    />
                    <div className="resolved-location">
                      <strong>{location.name}</strong>
                      <span>{location.address}</span>
                      <small>
                        {zonecode ? `우편번호 ${zonecode} / ` : ""}
                        {location.lat.toFixed(6)}, {location.lng.toFixed(6)} /
                        좌표 {location.provider}
                      </small>
                    </div>
                  </>
                )}
                <button
                  type="button"
                  className="primary-button"
                  disabled={!location || Boolean(loading)}
                  onClick={continueFromLocation}
                >
                  확인한 위치로 계속
                </button>
              </div>
            </div>
          </section>

          <section className={`screen ${step === 2 ? "active" : ""}`}>
            <ScreenHeader
              kicker="환자 정보"
              title="환자 상태를 설명해 주세요"
            >
              증상, 발생 시점, 의식, 활력징후, 특이사항을 입력하면 Gemini가
              공식 치료영역만 제시합니다.
            </ScreenHeader>
            <div className="screen-body">
              <div className="form-column">
                <label htmlFor="patient">환자 상태 입력</label>
                <textarea
                  id="patient"
                  value={patientNarrative}
                  onChange={(event) => resetPatient(event.target.value)}
                  placeholder={"- 연령대\n- 주요 증상과 발생 시점\n- 의식과 활력징후\n- 특이사항"}
                />
                <div className="form-helper">
                  <span>이름, 연락처, 주민등록번호는 입력하지 마세요.</span>
                  <strong>{patientNarrative.trim().length} / 2자 이상</strong>
                </div>
                <button
                  type="button"
                  className="primary-button"
                  disabled={Boolean(loading)}
                  onClick={() => void runAction(analyzePatient)}
                >
                  AI 분석 시작
                </button>
              </div>
            </div>
          </section>

          <section className={`screen ${step === 3 ? "active" : ""}`}>
            <ScreenHeader
              kicker="치료영역"
              title="필요한 치료영역을 선택하세요"
            >
              Gemini가 원문 근거와 함께 제시한 치료영역입니다. 병원 탐색에
              사용할 항목은 상황요원이 직접 선택합니다.
            </ScreenHeader>
            <div className="screen-body treatment-layout">
              <div>
                <div className="treatment-list">
                  {analysis?.treatments.map((treatment, index) => {
                    const selected = selectedCodes.includes(treatment.code);
                    return (
                      <button
                        type="button"
                        key={treatment.code}
                        className={`treatment-card ${
                          selected ? "selected" : ""
                        }`}
                        aria-pressed={selected}
                        onClick={() => toggleTreatment(treatment.code)}
                      >
                        <span>{String(index + 1).padStart(2, "0")}</span>
                        <span>
                          <strong>{treatment.label}</strong>
                          <small>
                            제안 근거:{" "}
                            {treatment.evidence
                              .map((quote) => `“${quote}”`)
                              .join(", ")}
                          </small>
                        </span>
                        <span className="treatment-check">
                          <i aria-hidden>{selected ? "✓" : ""}</i>
                          선택
                        </span>
                      </button>
                    );
                  })}
                </div>
                <p className="selection-count">
                  선택한 치료영역 {selectedCodes.length}개
                </p>
                <button
                  type="button"
                  className="primary-button"
                  disabled={selectedCodes.length === 0 || Boolean(loading)}
                  onClick={() => void runAction(findHospitals)}
                >
                  선택한 치료영역으로 병원 찾기
                </button>
              </div>
              <aside className="ai-note">
                <span>AI 초안</span>
                <strong>치료영역은 자동 확정되지 않습니다.</strong>
                <p>
                  확률, 질환 확정, 병원 추천은 생성하지 않습니다. 제안 코드와
                  원문 근거를 확인한 뒤 직접 선택하세요.
                </p>
                {analysis && (
                  <small>
                    {analysis.model} /{" "}
                    {new Date(analysis.analyzedAt).toLocaleTimeString("ko-KR")}
                  </small>
                )}
              </aside>
            </div>
          </section>

          <section
            className={`screen hospital-screen ${
              step === 4 ? "active" : ""
            }`}
          >
            <div className="hospital-stage">
              <div className="hospital-list-pane">
                <header className="hospital-list-header">
                  <div>
                    <span className="screen-kicker">병원 후보</span>
                    <h1>
                      {visibleCandidates.length}개 병원{" "}
                      {filter === "priority" ? "우선 검토" : "조회됨"}
                    </h1>
                    <p>
                      {location?.name} /{" "}
                      {analysis?.treatments
                        .filter((item) => selectedCodes.includes(item.code))
                        .map((item) => item.label)
                        .join(" / ")}
                    </p>
                  </div>
                  <div className="filter-group">
                    <button
                      type="button"
                      className={filter === "priority" ? "active" : ""}
                      onClick={() => {
                        setFilter("priority");
                        clearHospitalSelection();
                      }}
                    >
                      우선 검토
                    </button>
                    <button
                      type="button"
                      className={filter === "all" ? "active" : ""}
                      onClick={() => {
                        setFilter("all");
                        clearHospitalSelection();
                      }}
                    >
                      전체
                    </button>
                  </div>
                </header>
                <div className="hospital-table">
                  <div className="hospital-columns">
                    <span>병원</span>
                    <span>이동시간</span>
                    <span>거리</span>
                  </div>
                  <div className="hospital-rows" role="listbox">
                    {visibleCandidates.map((candidate, index) => {
                      const meta = stateMeta[candidate.state];
                      const priorityRank = index < 2 ? index + 1 : null;
                      const isActive =
                        candidate.hpid === resolvedActiveHospitalId;
                      const isSelected =
                        candidate.hpid === selectedHospitalId;
                      return (
                        <button
                          type="button"
                          role="option"
                          aria-selected={isActive}
                          aria-label={
                            priorityRank
                              ? `${priorityRank}순위 ${candidate.name}`
                              : candidate.name
                          }
                          key={candidate.hpid}
                          className={[
                            "hospital-row",
                            priorityRank === 1 ? "priority-one" : "",
                            priorityRank === 2 ? "priority-two" : "",
                            isActive ? "active" : "",
                            isSelected ? "selected" : "",
                            meta.className,
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          onClick={() => {
                            setActiveHospitalId(candidate.hpid);
                            if (candidate.hpid !== selectedHospitalId) {
                              clearHospitalSelection();
                            }
                          }}
                        >
                          <span>
                            <span className="hospital-name">
                              {priorityRank && (
                                <em className="priority-rank">
                                  {priorityRank}순위
                                </em>
                              )}
                              <strong>{candidate.name}</strong>
                              {isSelected && (
                                <em className="row-selection-status">
                                  선택 완료
                                </em>
                              )}
                            </span>
                            <small>
                              {meta.label} / {candidate.stateReason}
                            </small>
                          </span>
                          <strong>
                            {candidate.route.durationMinutes}
                            <small>분</small>
                          </strong>
                          <span>{candidate.route.distanceKm.toFixed(1)}km</span>
                        </button>
                      );
                    })}
                  </div>
                  <footer className="hospital-footnote">
                    <span>
                      NEMC {hospitalResult?.source.totalHospitals ?? 0}곳 중
                      Kakao 경로 {hospitalResult?.source.routedHospitals ?? 0}곳
                      계산
                    </span>
                    {hospitalResult?.source.warnings.length ? (
                      <strong>
                        일부 조회 경고 {hospitalResult.source.warnings.length}건
                      </strong>
                    ) : (
                      <strong>실시간 API 응답 정상</strong>
                    )}
                  </footer>
                </div>
              </div>

              <aside className="hospital-detail-pane">
                {!activeHospital ? (
                  <div className="hospital-placeholder">
                    <span className="screen-kicker">병원 검토</span>
                    <h2>병원을 선택하세요</h2>
                    <p>
                      좌측 목록에서 병원을 선택하면 NEMC 상태와 Kakao ETA를
                      한곳에서 확인할 수 있습니다.
                    </p>
                  </div>
                ) : (
                  <HospitalDetail
                    hospital={activeHospital}
                    selected={selectedHospitalId === activeHospital.hpid}
                    onSelect={() => confirmHospitalSelection(activeHospital)}
                  />
                )}
              </aside>
            </div>
          </section>
        </main>
      </div>

      {loading && (
        <div className="loading-overlay" aria-live="polite">
          <div>
            <span>{loading.kicker}</span>
            <h2>{loading.title}</h2>
            <p>
              <span>{loading.labels[loading.phase]}</span>
              <strong>{loading.elapsedSeconds}초 경과</strong>
            </p>
            <div
              className="progress-track"
              role="progressbar"
              aria-label={loading.labels[loading.phase]}
            >
              <i />
            </div>
          </div>
        </div>
      )}
      {summaryOpen &&
        selectedHospital &&
        selectedHospitalAt &&
        location && (
          <TransferSummaryDialog
            hospital={selectedHospital}
            location={location}
            patientNarrative={patientNarrative}
            selectedAt={selectedHospitalAt}
            copyState={summaryCopyState}
            onCopy={() => void copyTransferSummary()}
            onClose={() => {
              setSummaryOpen(false);
              setSummaryCopyState("idle");
            }}
          />
        )}
    </div>
  );
}

function HospitalDetail({
  hospital,
  selected,
  onSelect,
}: {
  hospital: HospitalCandidate;
  selected: boolean;
  onSelect: () => void;
}) {
  const meta = stateMeta[hospital.state];
  return (
    <div className="hospital-detail-content">
      <header>
        <span>{selected ? "선택한 병원" : "병원 상세"}</span>
        <h2>{hospital.name}</h2>
        <div>
          <strong className={meta.className}>{meta.label}</strong>
          <strong>{hospital.tier}</strong>
        </div>
      </header>
      <div className="detail-metrics">
        <div>
          <span>이동시간</span>
          <strong>{hospital.route.durationMinutes}분</strong>
        </div>
        <div>
          <span>거리</span>
          <strong>{hospital.route.distanceKm.toFixed(1)}km</strong>
        </div>
      </div>
      <div className="detail-facts">
        <div>
          <span>치료영역</span>
          <strong>
            {hospital.treatments.map((item) => item.label).join(" / ")}
          </strong>
        </div>
        <div>
          <span>수용정보</span>
          <strong>
            {hospital.treatments
              .map((item) => `${item.label} ${item.raw}`)
              .join(" / ")}
          </strong>
        </div>
        <div>
          <span>가용 병상</span>
          <strong>
            {hospital.hvec === null
              ? "정보미제공"
              : `응급실 ${hospital.hvec}병상`}
          </strong>
        </div>
        <div>
          <span>판정 근거</span>
          <strong>{hospital.stateReason}</strong>
        </div>
        <HistoricalEvidence history={hospital.history} />
        <div>
          <span>기준 시각</span>
          <strong>{formatHvidate(hospital.hvidate)}</strong>
        </div>
        <div>
          <span>주소</span>
          <strong>{hospital.address}</strong>
        </div>
      </div>
      <footer>
        <button
          type="button"
          className={selected ? "selected" : ""}
          onClick={onSelect}
        >
          {selected ? "이송 요약 보기" : "이 후보 선택"}
        </button>
        <div>
          <span>응급실 전화</span>
          <strong>{hospital.phone}</strong>
        </div>
      </footer>
    </div>
  );
}

function TransferSummaryDialog({
  hospital,
  location,
  patientNarrative,
  selectedAt,
  copyState,
  onCopy,
  onClose,
}: {
  hospital: HospitalCandidate;
  location: ResolvedLocation;
  patientNarrative: string;
  selectedAt: string;
  copyState: CopyState;
  onCopy: () => void;
  onClose: () => void;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  const meta = stateMeta[hospital.state];

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <div
      className="transfer-summary-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="transfer-summary-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="transfer-summary-title"
      >
        <header>
          <div>
            <span>선택 완료</span>
            <h2 id="transfer-summary-title">이송 후보 요약</h2>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            aria-label="이송 후보 요약 닫기"
            onClick={onClose}
          >
            닫기
          </button>
        </header>
        <div className="transfer-summary-body">
          <div className="transfer-summary-hospital">
            <div>
              <span>선택 병원</span>
              <strong>{hospital.name}</strong>
            </div>
            <div>
              <span>실시간 판정</span>
              <strong className={meta.className}>{meta.label}</strong>
              <small>{hospital.stateReason}</small>
            </div>
          </div>
          <dl>
            <div>
              <dt>선택 시각</dt>
              <dd>{formatSummaryTime(selectedAt)}</dd>
            </div>
            <div>
              <dt>신고 위치</dt>
              <dd>{location.address}</dd>
            </div>
            <div className="wide">
              <dt>환자 상태</dt>
              <dd>{patientNarrative.trim()}</dd>
            </div>
            <div className="wide">
              <dt>필요 치료영역</dt>
              <dd>
                {hospital.treatments
                  .map((treatment) => treatment.label)
                  .join(", ")}
              </dd>
            </div>
            <div>
              <dt>이동시간</dt>
              <dd>{hospital.route.durationMinutes}분</dd>
            </div>
            <div>
              <dt>거리</dt>
              <dd>{hospital.route.distanceKm.toFixed(1)}km</dd>
            </div>
            <div>
              <dt>가용 병상</dt>
              <dd>
                {hospital.hvec === null
                  ? "정보미제공"
                  : `응급실 ${hospital.hvec}병상`}
              </dd>
            </div>
            <div>
              <dt>NEMC 기준 시각</dt>
              <dd>{formatHvidate(hospital.hvidate)}</dd>
            </div>
            <div className="wide">
              <dt>응급실 전화</dt>
              <dd>{hospital.phone}</dd>
            </div>
          </dl>
          <p className="transfer-summary-warning">
            이 요약은 수용 확약이 아닙니다. 실제 이송 전 병원에 수용 가능
            여부를 확인하세요.
          </p>
        </div>
        <footer>
          <p
            className={copyState === "error" ? "error" : ""}
            role="status"
            aria-live="polite"
          >
            {copyState === "success" && "요약을 클립보드에 복사했습니다."}
            {copyState === "error" &&
              "요약을 복사하지 못했습니다. 브라우저 권한을 확인하세요."}
          </p>
          <button type="button" onClick={onCopy}>
            요약 복사
          </button>
        </footer>
      </section>
    </div>
  );
}

function HistoricalEvidence({
  history,
}: {
  history: HospitalHistoryEvidence | null;
}) {
  return (
    <section className="history-evidence">
      <header>
        <div>
          <span>최근 보고 패턴</span>
          <p>가능, 불가능, 정보미제공으로 보고한 과거 비율입니다.</p>
        </div>
        <strong>
          {history
            ? `${formatHistoryTime(history.observedFrom)} ~ ${formatHistoryTime(
                history.observedTo,
              )}`
            : "관측 없음"}
        </strong>
      </header>
      {!history || history.treatments.length === 0 ? (
        <p className="history-empty">
          이 병원과 치료영역은 현재 파생 데이터의 수집 범위에 포함되지
          않았습니다.
        </p>
      ) : (
        <>
          <div className="history-treatment-list">
            {history.treatments.map((treatment) => {
              const interpretation = interpretHistory(treatment);
              const unavailablePercent =
                (treatment.unavailableCount / treatment.observationCount) * 100;
              return (
                <article key={treatment.code}>
                  <header>
                    <strong>{treatment.label}</strong>
                    <span>{treatment.observationCount}회 관측</span>
                  </header>
                  <div
                    className={`history-interpretation ${interpretation.tone}`}
                  >
                    <strong>{interpretation.label}</strong>
                    <p>{interpretation.description}</p>
                  </div>
                  <div
                    className="history-distribution"
                    aria-label={`가능 ${treatment.yPercent.toFixed(
                      1,
                    )}%, 불가능 ${unavailablePercent.toFixed(
                      1,
                    )}%, 정보미제공 ${treatment.unknownPercent.toFixed(1)}%`}
                  >
                    <i
                      className="available"
                      style={{ width: `${treatment.yPercent}%` }}
                    />
                    <i
                      className="unavailable"
                      style={{ width: `${unavailablePercent}%` }}
                    />
                    <i
                      className="unknown"
                      style={{ width: `${treatment.unknownPercent}%` }}
                    />
                  </div>
                  <div className="history-legend">
                    <span>
                      <i className="available" />
                      가능(Y)
                      <strong>{Math.round(treatment.yPercent)}%</strong>
                    </span>
                    <span>
                      <i className="unavailable" />
                      불가능
                      <strong>{Math.round(unavailablePercent)}%</strong>
                    </span>
                    <span>
                      <i className="unknown" />
                      정보미제공
                      <strong>{Math.round(treatment.unknownPercent)}%</strong>
                    </span>
                  </div>
                  <dl className="history-secondary">
                    <div>
                      <dt>상태 변경</dt>
                      <dd>{treatment.transitionCount}회</dd>
                    </div>
                    <div>
                      <dt>마지막 관측</dt>
                      <dd>
                        {formatHistoryState(treatment.lastObservedState)}
                      </dd>
                    </div>
                    <div>
                      <dt>관측 시각</dt>
                      <dd>{formatHistoryTime(treatment.lastObservedAt)}</dd>
                    </div>
                  </dl>
                </article>
              );
            })}
          </div>
          {history.bed && (
            <div className="history-bed">
              <strong>병상 보고 변동</strong>
              <span>
                {history.bed.observationCount}회 관측 중 병상값{" "}
                {history.bed.transitionCount}회 변경
              </span>
              {history.bed.lastReportedAt && (
                <small>
                  마지막 갱신 {formatHistoryTime(history.bed.lastReportedAt)}
                </small>
              )}
            </div>
          )}
        </>
      )}
      <footer>
        참고용 보고 이력이며 수용확률이 아닙니다. 현재 판정과 후보 순위에는
        반영하지 않습니다.
      </footer>
    </section>
  );
}
