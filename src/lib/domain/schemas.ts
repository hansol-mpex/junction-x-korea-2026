import { z } from "zod";

export const capabilityCodes = [
  "ER_GATEKEEPER",
  "TRAUMA_RESUSCITATION",
  "TRAUMA_OPERATING_ROOM",
  "OPERATING_ROOM",
  "TRAUMA_ICU",
  "SURGICAL_ICU",
  "GENERAL_ICU",
  "NEUROSURGERY_ICU",
  "CT",
  "VENTILATOR",
  "SAH_SURGERY",
  "ICH_SURGERY",
  "ABDOMINAL_TRAUMA_SURGERY",
] as const;

export const CapabilityCodeSchema = z.enum(capabilityCodes);
export type CapabilityCode = z.infer<typeof CapabilityCodeSchema>;

export const capabilityLabels: Record<CapabilityCode, string> = {
  ER_GATEKEEPER: "응급실 수용",
  TRAUMA_RESUSCITATION: "외상소생실",
  TRAUMA_OPERATING_ROOM: "외상전용 수술실",
  OPERATING_ROOM: "수술실",
  TRAUMA_ICU: "외상 중환자실",
  SURGICAL_ICU: "외과 중환자실",
  GENERAL_ICU: "일반 중환자실",
  NEUROSURGERY_ICU: "신경외과 중환자실",
  CT: "CT",
  VENTILATOR: "인공호흡기",
  SAH_SURGERY: "거미막하출혈 수술",
  ICH_SURGERY: "기타 뇌출혈 수술",
  ABDOMINAL_TRAUMA_SURGERY: "복부손상 수술",
};

export const defaultTraumaCapabilities: CapabilityCode[] = [
  "ER_GATEKEEPER",
  "TRAUMA_RESUSCITATION",
  "OPERATING_ROOM",
  "GENERAL_ICU",
  "CT",
  "VENTILATOR",
];

export const IncidentInputSchema = z.object({
  location: z.object({
    address: z.string().min(2).max(160),
    lat: z.number().min(35).max(38.8),
    lng: z.number().min(127).max(130.9),
    region: z.literal("경상북도"),
  }),
  preKtas: z.enum(["1", "2", "3"]),
  ageGroup: z.enum(["ADULT", "OLDER_ADULT"]),
  mechanism: z.enum(["FALL", "TRAFFIC", "CRUSH", "PENETRATING", "OTHER"]),
  vitals: z.object({
    consciousness: z.enum(["ALERT", "VOICE", "PAIN", "UNRESPONSIVE"]),
    systolicBp: z.number().int().min(0).max(300).nullable(),
    heartRate: z.number().int().min(0).max(300).nullable(),
    spo2: z.number().int().min(0).max(100).nullable(),
  }),
  requiredCapabilities: z.array(CapabilityCodeSchema).min(1),
  notes: z.string().max(500).default(""),
  useDemoData: z.boolean().default(false),
});

export type IncidentInput = z.infer<typeof IncidentInputSchema>;

export const dataRiskLevels = ["LOW", "CAUTION", "HIGH"] as const;
export type DataRiskLevel = (typeof dataRiskLevels)[number];

export const eligibilityStates = [
  "CONFIRMED",
  "VERIFY_REQUIRED",
  "INELIGIBLE",
] as const;
export type EligibilityState = (typeof eligibilityStates)[number];

export type AvailabilityStatus = "Y" | "N" | "N1" | "UNAVAILABLE" | "UNKNOWN";

export interface HospitalSnapshot {
  hpid: string;
  name: string;
  address: string;
  region: string;
  emergencyClassCode?: string;
  emergencyClassName?: string;
  isTraumaCenter: boolean;
  erPhone?: string;
  mainPhone?: string;
  lat: number;
  lng: number;
  erOperating: boolean;
  beds: Record<string, number | undefined>;
  equipment: Record<string, AvailabilityStatus>;
  acceptance: Record<string, AvailabilityStatus>;
  basicCapabilities: Record<string, AvailabilityStatus>;
  sourceUpdatedAt?: string;
  sourceAgeMinutes?: number;
  sourceMode: "LIVE" | "SNAPSHOT";
}

export interface RouteEstimate {
  distanceKm: number;
  durationMinutes: number;
  mode: "LIVE" | "ESTIMATED";
}

export interface CapabilityEvidence {
  code: CapabilityCode;
  label: string;
  state: "SATISFIED" | "UNKNOWN" | "FAILED";
  detail: string;
}

export interface EvaluatedCandidate {
  hospital: HospitalSnapshot;
  route: RouteEstimate;
  eligibility: EligibilityState;
  capabilityEvidence: CapabilityEvidence[];
  rejectionReasons: string[];
  verificationReasons: string[];
  risk: DataRiskLevel;
  riskReasons: string[];
  capacityBuffer: number;
}

export const recommendationReasonCodes = [
  "COMPLETE_CARE_CHAIN",
  "TRAUMA_CENTER",
  "LOW_DATA_RISK",
  "FRESH_DATA",
  "STRONG_CAPACITY",
  "SHORTER_ETA",
  "VERIFICATION_REQUIRED",
  "LONGER_TRANSPORT",
  "LIMITED_BUFFER",
] as const;

export const RecommendationReasonCodeSchema = z.enum(recommendationReasonCodes);
export type RecommendationReasonCode = z.infer<
  typeof RecommendationReasonCodeSchema
>;

export const AiRankingSchema = z.object({
  ranked: z
    .array(
      z.object({
        hospitalId: z.string().min(1),
        reasonCodes: z.array(RecommendationReasonCodeSchema).min(1).max(4),
        tradeoffCodes: z.array(RecommendationReasonCodeSchema).max(3),
      }),
    )
    .min(1)
    .max(3),
  warningCodes: z.array(RecommendationReasonCodeSchema).max(4),
});

export type AiRanking = z.infer<typeof AiRankingSchema>;

export interface RankedCandidate extends EvaluatedCandidate {
  rank: number;
  reasonCodes: RecommendationReasonCode[];
  tradeoffCodes: RecommendationReasonCode[];
}

export interface SourceStatus {
  nemc: "LIVE" | "SNAPSHOT" | "ERROR";
  routing: "LIVE" | "ESTIMATED" | "ERROR";
  ranking: "GEMINI" | "DETERMINISTIC";
  queriedAt: string;
  warnings: string[];
}

export interface RecommendationResponse {
  recommendations: RankedCandidate[];
  nearestRejected?: EvaluatedCandidate;
  sourceStatus: SourceStatus;
  totalHospitals: number;
  eligibleHospitals: number;
}
