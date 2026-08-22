export const treatmentAreas = [
  { code: "MKioskTy1", label: "심근경색 재관류중재술" },
  { code: "MKioskTy2", label: "뇌경색 재관류중재술" },
  { code: "MKioskTy3", label: "거미막하출혈 수술" },
  { code: "MKioskTy4", label: "기타 뇌출혈 수술" },
  { code: "MKioskTy5", label: "흉부 대동맥응급" },
  { code: "MKioskTy6", label: "복부 대동맥응급" },
  { code: "MKioskTy7", label: "담낭질환" },
  { code: "MKioskTy8", label: "담도포함질환" },
  { code: "MKioskTy9", label: "비외상 복부응급수술" },
  { code: "MKioskTy10", label: "영유아 장중첩 및 폐색" },
  { code: "MKioskTy11", label: "성인 위장관 응급내시경" },
  { code: "MKioskTy12", label: "영유아 위장관 응급내시경" },
  { code: "MKioskTy13", label: "성인 기관지 응급내시경" },
  { code: "MKioskTy14", label: "영유아 기관지 응급내시경" },
  { code: "MKioskTy15", label: "저체중출생아 집중치료" },
  { code: "MKioskTy16", label: "분만" },
  { code: "MKioskTy17", label: "산과수술" },
  { code: "MKioskTy18", label: "부인과수술" },
  { code: "MKioskTy19", label: "중증화상 전문치료" },
  { code: "MKioskTy20", label: "수족지접합" },
  { code: "MKioskTy21", label: "수족지 외 사지접합" },
  { code: "MKioskTy22", label: "응급투석 HD" },
  { code: "MKioskTy23", label: "응급투석 CRRT" },
  { code: "MKioskTy24", label: "정신과 폐쇄병동입원" },
  { code: "MKioskTy25", label: "응급 안과수술" },
  { code: "MKioskTy26", label: "성인 영상의학 혈관중재" },
  { code: "MKioskTy27", label: "영유아 영상의학 혈관중재" },
] as const;

export const treatmentAreaCodes = treatmentAreas.map(
  (area) => area.code,
) as [
  (typeof treatmentAreas)[number]["code"],
  ...(typeof treatmentAreas)[number]["code"][],
];

export type TreatmentAreaCode = (typeof treatmentAreas)[number]["code"];

export const treatmentAreaLabels = Object.fromEntries(
  treatmentAreas.map((area) => [area.code, area.label]),
) as Record<TreatmentAreaCode, string>;
