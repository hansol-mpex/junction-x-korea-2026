import { z } from "zod";
import {
  treatmentAreaCodes,
  treatmentAreaLabels,
  type TreatmentAreaCode,
} from "./catalog";

export const TreatmentAreaCodeSchema = z.enum(treatmentAreaCodes);

export const LocationRequestSchema = z.object({
  query: z.string().trim().min(2).max(160),
});

export const ResolvedLocationSchema = z.object({
  query: z.string().min(2),
  address: z.string().min(2),
  name: z.string().min(1),
  lat: z.number().min(33).max(39),
  lng: z.number().min(124).max(132),
  provider: z.enum(["KAKAO", "OPENSTREETMAP"]),
});

export type ResolvedLocation = z.infer<typeof ResolvedLocationSchema>;

export const PatientAnalysisRequestSchema = z.object({
  narrative: z.string().trim().min(2).max(2000),
});

const AiTreatmentSuggestionSchema = z.object({
  code: TreatmentAreaCodeSchema,
  evidence: z.array(z.string().trim().min(1)).min(1).max(4),
});

export const AiTreatmentAnalysisSchema = z.object({
  treatments: z.array(AiTreatmentSuggestionSchema).min(1).max(5),
});

export const TreatmentAnalysisSchema = z.object({
  treatments: z
    .array(
      AiTreatmentSuggestionSchema.extend({
        label: z.string().min(1),
      }),
    )
    .min(1)
    .max(5),
  analyzedAt: z.string().datetime(),
  model: z.string().min(1),
});

export type TreatmentAnalysis = z.infer<typeof TreatmentAnalysisSchema>;

export function canonicalizeAnalysis({
  raw,
  narrative,
  model,
}: {
  raw: z.infer<typeof AiTreatmentAnalysisSchema>;
  narrative: string;
  model: string;
}): TreatmentAnalysis {
  const seen = new Set<TreatmentAreaCode>();
  const treatments = raw.treatments.map((treatment) => {
    if (seen.has(treatment.code)) {
      throw new Error(`AI가 치료영역 ${treatment.code}를 중복 반환했습니다.`);
    }
    seen.add(treatment.code);

    const evidence = treatment.evidence.map((quote) => quote.trim());
    if (evidence.some((quote) => !narrative.includes(quote))) {
      throw new Error(
        `AI 근거가 환자 설명 원문과 일치하지 않습니다: ${treatment.code}`,
      );
    }

    return {
      code: treatment.code,
      label: treatmentAreaLabels[treatment.code],
      evidence,
    };
  });

  return TreatmentAnalysisSchema.parse({
    treatments,
    analyzedAt: new Date().toISOString(),
    model,
  });
}

export const HospitalSearchRequestSchema = z.object({
  location: ResolvedLocationSchema,
  treatmentCodes: z.array(TreatmentAreaCodeSchema).min(1).max(5),
});

export type HospitalSearchRequest = z.infer<
  typeof HospitalSearchRequestSchema
>;

export type NormalizedAvailability = "Y" | "N" | "N1" | "UNKNOWN";
export type AcceptanceState =
  | "CONFIRMED"
  | "VERIFY_REQUIRED"
  | "REPORTED_UNAVAILABLE";

export interface TreatmentStatus {
  code: TreatmentAreaCode;
  label: string;
  raw: string;
  normalized: NormalizedAvailability;
}

export type HistoricalObservedState = "Y" | "UNAVAILABLE" | "UNKNOWN";

export interface HistoricalTreatmentEvidence {
  code: TreatmentAreaCode;
  label: string;
  observationCount: number;
  yCount: number;
  unavailableCount: number;
  unknownCount: number;
  yPercent: number;
  unknownPercent: number;
  transitionCount: number;
  firstObservedAt: string;
  lastObservedAt: string;
  currentStateSince: string;
  lastObservedState: HistoricalObservedState;
}

export interface HistoricalBedEvidence {
  observationCount: number;
  transitionCount: number;
  firstObservedAt: string;
  lastObservedAt: string;
  lastReportedAt: string | null;
}

export interface HospitalHistoryEvidence {
  region: string;
  observedFrom: string;
  observedTo: string;
  treatments: HistoricalTreatmentEvidence[];
  bed: HistoricalBedEvidence | null;
}

export interface HistoricalDataSource {
  mode: "OBSERVATION_ONLY";
  generatedAt: string;
  observedFrom: string;
  observedTo: string;
  regions: string[];
  hospitalCount: number;
}

export interface TransferHospital {
  hpid: string;
  name: string;
  region: string;
  address: string;
  tier: string;
  phone: string;
  lat: number;
  lng: number;
  hvec: number | null;
  hvidate: string | null;
  gateRaw: string;
  gate: NormalizedAvailability;
  treatments: TreatmentStatus[];
}

export interface HospitalCandidate extends TransferHospital {
  state: AcceptanceState;
  stateReason: string;
  history: HospitalHistoryEvidence | null;
  route: {
    distanceKm: number;
    durationMinutes: number;
    mode: "LIVE";
  };
}

export interface HospitalSearchResponse {
  candidates: HospitalCandidate[];
  queriedAt: string;
  source: {
    nemc: "LIVE";
    routing: "LIVE";
    history: HistoricalDataSource;
    warnings: string[];
    totalHospitals: number;
    routedHospitals: number;
  };
}
