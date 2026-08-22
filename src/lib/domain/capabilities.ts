import type { CapabilityCode } from "./schemas";

type FieldSource = "beds" | "equipment" | "acceptance" | "basicCapabilities";

export interface CapabilityRule {
  source: FieldSource;
  field: string;
  kind: "POSITIVE_NUMBER" | "AVAILABLE";
}

export const capabilityRules: Record<CapabilityCode, CapabilityRule> = {
  ER_GATEKEEPER: {
    source: "acceptance",
    field: "MKioskTy28",
    kind: "AVAILABLE",
  },
  TRAUMA_RESUSCITATION: {
    source: "beds",
    field: "hv60",
    kind: "POSITIVE_NUMBER",
  },
  TRAUMA_OPERATING_ROOM: {
    source: "beds",
    field: "hv39",
    kind: "POSITIVE_NUMBER",
  },
  OPERATING_ROOM: {
    source: "beds",
    field: "hvoc",
    kind: "POSITIVE_NUMBER",
  },
  TRAUMA_ICU: {
    source: "beds",
    field: "hv9",
    kind: "POSITIVE_NUMBER",
  },
  SURGICAL_ICU: {
    source: "beds",
    field: "hv3",
    kind: "POSITIVE_NUMBER",
  },
  GENERAL_ICU: {
    source: "beds",
    field: "hvicc",
    kind: "POSITIVE_NUMBER",
  },
  NEUROSURGERY_ICU: {
    source: "beds",
    field: "hv6",
    kind: "POSITIVE_NUMBER",
  },
  CT: {
    source: "equipment",
    field: "hvctayn",
    kind: "AVAILABLE",
  },
  VENTILATOR: {
    source: "equipment",
    field: "hvventiayn",
    kind: "AVAILABLE",
  },
  SAH_SURGERY: {
    source: "acceptance",
    field: "MKioskTy3",
    kind: "AVAILABLE",
  },
  ICH_SURGERY: {
    source: "acceptance",
    field: "MKioskTy4",
    kind: "AVAILABLE",
  },
  ABDOMINAL_TRAUMA_SURGERY: {
    source: "basicCapabilities",
    field: "MKioskTy4",
    kind: "AVAILABLE",
  },
};

export const reasonCodeLabels = {
  COMPLETE_CARE_CHAIN: "요청된 최종치료 역량을 모두 확인했습니다.",
  TRAUMA_CENTER: "외상센터로 지정된 기관입니다.",
  LOW_DATA_RISK: "핵심 데이터의 누락 위험이 낮습니다.",
  FRESH_DATA: "최근 갱신된 응급의료 정보를 사용했습니다.",
  STRONG_CAPACITY: "필수 수술실·중환자실 가용 여유가 상대적으로 큽니다.",
  SHORTER_ETA: "적격 후보 중 예상 이동시간이 짧습니다.",
  VERIFICATION_REQUIRED: "일부 상태는 전화 확인이 필요합니다.",
  LONGER_TRANSPORT: "다른 후보보다 이동시간이 깁니다.",
  LIMITED_BUFFER: "필수 자원의 가용 여유가 임계치에 가깝습니다.",
} as const;
