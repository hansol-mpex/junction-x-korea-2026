import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import {
  AiRankingSchema,
  recommendationReasonCodes,
  type EvaluatedCandidate,
  type IncidentInput,
  type RankedCandidate,
} from "@/lib/domain/schemas";

/** AI가 고른 1순위가 최속 후보보다 이만큼 넘게 느리면 폐기하고 결정론 순위를 쓴다. */
const MAX_TOP_RANK_ETA_PENALTY_MINUTES = 30;

export async function rankWithGemini({
  apiKey,
  model,
  incident,
  candidates,
}: {
  apiKey: string;
  model: string;
  incident: IncidentInput;
  candidates: EvaluatedCandidate[];
}): Promise<RankedCandidate[]> {
  if (candidates.length === 0) return [];

  const allowedIds = new Set(candidates.map((item) => item.hospital.hpid));
  const ai = new GoogleGenAI({ apiKey });
  const safeIncident = {
    preKtas: incident.preKtas,
    ageGroup: incident.ageGroup,
    mechanism: incident.mechanism,
    vitals: incident.vitals,
    requiredCapabilities: incident.requiredCapabilities,
    notes: incident.notes,
  };
  const candidateFacts = candidates.map((candidate) => ({
    hospitalId: candidate.hospital.hpid,
    hospitalName: candidate.hospital.name,
    eligibility: candidate.eligibility,
    traumaCenter: candidate.hospital.isTraumaCenter,
    etaMinutes: candidate.route.durationMinutes,
    routeMode: candidate.route.mode,
    risk: candidate.risk,
    riskReasons: candidate.riskReasons,
    capacityBuffer: candidate.capacityBuffer,
    capabilities: candidate.capabilityEvidence.map((evidence) => ({
      code: evidence.code,
      state: evidence.state,
      detail: evidence.detail,
    })),
  }));

  const response = await ai.models.generateContent({
    model,
    contents: JSON.stringify({ incident: safeIncident, candidates: candidateFacts }),
    config: {
      systemInstruction: [
        "당신은 119 구급상황관리센터의 병원 후보 순위 보조 엔진이다.",
        "제공된 후보 ID와 사실만 사용한다. 새로운 병원, 역량, 수치를 만들지 않는다.",
        "중증외상은 시간 민감 질환이다. 우선순위는 1) 재전원 없는 최종치료 역량(CONFIRMED), 2) 예상 이동시간(etaMinutes), 3) 데이터 위험(risk), 4) 자원 여유(capacityBuffer) 순이다.",
        "자원 여유나 외상센터 지정만을 이유로 이동시간이 크게 긴 병원을 1순위로 올리지 않는다.",
        "최대 3곳을 중복 없이 선택한다.",
        `근거와 트레이드오프는 다음 코드만 사용한다: ${recommendationReasonCodes.join(", ")}`,
      ].join("\n"),
      temperature: 0,
      seed: 119,
      responseMimeType: "application/json",
      responseJsonSchema: z.toJSONSchema(AiRankingSchema),
    },
  });

  if (!response.text) throw new Error("Gemini가 빈 응답을 반환했습니다.");
  const ranking = AiRankingSchema.parse(JSON.parse(response.text));
  const expectedCount = Math.min(3, candidates.length);
  if (ranking.ranked.length !== expectedCount) {
    throw new Error(
      `Gemini 추천 수가 올바르지 않습니다: ${ranking.ranked.length}/${expectedCount}`,
    );
  }

  const ids = ranking.ranked.map((item) => item.hospitalId);
  if (new Set(ids).size !== ids.length || ids.some((id) => !allowedIds.has(id))) {
    throw new Error("Gemini가 허용되지 않은 병원 또는 중복 병원을 선택했습니다.");
  }

  const byId = new Map(
    candidates.map((candidate) => [candidate.hospital.hpid, candidate]),
  );

  // AI 안전 경계: 이동시간이 최속 적격 후보보다 크게 뒤처지는 병원을
  // 1순위로 올리면 임상적으로 위험하므로 결정론 순위로 되돌린다.
  const fastestEligibleMinutes = Math.min(
    ...candidates
      .filter((candidate) => candidate.eligibility === "CONFIRMED")
      .map((candidate) => candidate.route.durationMinutes),
    ...candidates.map((candidate) => candidate.route.durationMinutes),
  );
  const topCandidate = byId.get(ids[0]);
  if (
    topCandidate &&
    topCandidate.route.durationMinutes >
      fastestEligibleMinutes + MAX_TOP_RANK_ETA_PENALTY_MINUTES
  ) {
    throw new Error(
      `Gemini 1순위(${topCandidate.route.durationMinutes}분)가 최속 후보(${fastestEligibleMinutes}분)보다 ${MAX_TOP_RANK_ETA_PENALTY_MINUTES}분 넘게 느립니다.`,
    );
  }

  return ranking.ranked.map((item, index) => ({
    ...byId.get(item.hospitalId)!,
    rank: index + 1,
    reasonCodes: item.reasonCodes,
    tradeoffCodes: item.tradeoffCodes,
  }));
}
