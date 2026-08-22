import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { z } from "zod";
import { treatmentAreas } from "./catalog";
import {
  AiTreatmentAnalysisSchema,
  canonicalizeAnalysis,
  type TreatmentAnalysis,
} from "./schemas";

export async function analyzePatientNarrative({
  apiKey,
  model,
  narrative,
}: {
  apiKey: string;
  model: string;
  narrative: string;
}): Promise<TreatmentAnalysis> {
  const ai = new GoogleGenAI({ apiKey });
  const catalog = treatmentAreas
    .map((area) => `${area.code}=${area.label}`)
    .join("\n");

  const response = await ai.models.generateContent({
    model,
    contents: narrative,
    config: {
      systemInstruction: [
        "당신은 119 구급상황관리센터의 치료영역 분류 보조 엔진이다.",
        "환자 설명을 확정 진단하거나 중증도 또는 확률을 출력하지 않는다.",
        "아래 공식 치료영역에서 직접 필요한 항목만 1~5개 선택한다.",
        "병원명, 병원 ID, 병원 추천은 출력하지 않는다.",
        "evidence는 입력 문장에 실제로 존재하는 연속된 원문만 인용한다.",
        "추론하거나 바꿔 쓴 문장을 evidence로 사용하지 않는다.",
        catalog,
      ].join("\n"),
      temperature: 0,
      thinkingConfig: {
        thinkingLevel: ThinkingLevel.MINIMAL,
        includeThoughts: false,
      },
      responseMimeType: "application/json",
      responseJsonSchema: z.toJSONSchema(AiTreatmentAnalysisSchema),
    },
  });

  if (!response.text) {
    throw new Error("Gemini가 빈 분석 결과를 반환했습니다.");
  }

  const raw = AiTreatmentAnalysisSchema.parse(JSON.parse(response.text));
  return canonicalizeAnalysis({ raw, narrative, model });
}
