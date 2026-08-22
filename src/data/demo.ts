import demoHospitals from "./demo-hospitals.json";
import type { HospitalSnapshot, IncidentInput } from "@/lib/domain/schemas";

export const demoIncident: IncidentInput = {
  location: {
    address: "경상북도 영양군 입암면 (합성 사고지점)",
    lat: 36.593,
    lng: 129.09,
    region: "경상북도",
  },
  preKtas: "1",
  ageGroup: "ADULT",
  mechanism: "FALL",
  vitals: {
    consciousness: "VOICE",
    systolicBp: 86,
    heartRate: 124,
    spo2: 91,
  },
  requiredCapabilities: [
    "ER_GATEKEEPER",
    "TRAUMA_RESUSCITATION",
    "OPERATING_ROOM",
    "GENERAL_ICU",
    "CT",
    "VENTILATOR",
  ],
  notes: "산간 도로 인근 추락. 두부 및 복부 손상 의심. 개인식별정보 없음.",
  useDemoData: true,
};

export const demoHospitalSnapshots = demoHospitals as HospitalSnapshot[];
