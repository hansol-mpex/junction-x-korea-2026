export interface TransferSummaryTextInput {
  selectedAt: string;
  location: string;
  patientNarrative: string;
  treatments: string;
  hospitalName: string;
  hospitalState: string;
  route: string;
  beds: string;
  dataTimestamp: string;
  phone: string;
}

export function buildTransferSummaryText(input: TransferSummaryTextInput) {
  return [
    "응급실로 이송 후보 요약",
    `선택 시각: ${input.selectedAt}`,
    `신고 위치: ${input.location}`,
    `환자 상태: ${input.patientNarrative}`,
    `필요 치료영역: ${input.treatments}`,
    `선택 병원: ${input.hospitalName}`,
    `실시간 판정: ${input.hospitalState}`,
    `이동 예상: ${input.route}`,
    `가용 병상: ${input.beds}`,
    `NEMC 기준 시각: ${input.dataTimestamp}`,
    `응급실 전화: ${input.phone}`,
    "",
    "이 요약은 수용 확약이 아닙니다. 실제 이송 전 병원에 확인해야 합니다.",
  ].join("\n");
}
