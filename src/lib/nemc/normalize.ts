import type {
  AvailabilityStatus,
  HospitalSnapshot,
} from "@/lib/domain/schemas";
import type {
  RawAcceptance,
  RawHospital,
  RawRealtimeBeds,
} from "./client";

const bedFields = [
  "hvec",
  "hvoc",
  "hv3",
  "hv6",
  "hv9",
  "hv39",
  "hv60",
  "hvicc",
] as const;

const equipmentFields = ["hvctayn", "hvventiayn"] as const;
const acceptanceFields = ["MKioskTy3", "MKioskTy4", "MKioskTy28"] as const;
const basicCapabilityFields = [
  "MKioskTy1",
  "MKioskTy2",
  "MKioskTy3",
  "MKioskTy4",
  "MKioskTy5",
  "MKioskTy6",
  "MKioskTy7",
  "MKioskTy8",
  "MKioskTy9",
  "MKioskTy10",
  "MKioskTy11",
] as const;

export function parseHvidate(value?: string): Date | undefined {
  if (!value || !/^\d{14}$/.test(value)) return undefined;

  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6)) - 1;
  const day = Number(value.slice(6, 8));
  const hour = Number(value.slice(8, 10));
  const minute = Number(value.slice(10, 12));
  const second = Number(value.slice(12, 14));
  const kstOffsetMs = 9 * 60 * 60 * 1000;
  const timestamp =
    Date.UTC(year, month, day, hour, minute, second) - kstOffsetMs;
  const date = new Date(timestamp);

  return Number.isNaN(date.getTime()) ? undefined : date;
}

export function sourceAgeMinutes(
  value?: string,
  now = new Date(),
): number | undefined {
  const parsed = parseHvidate(value);
  if (!parsed) return undefined;
  return Math.max(0, Math.round((now.getTime() - parsed.getTime()) / 60_000));
}

export function normalizeAvailability(value?: string): AvailabilityStatus {
  const normalized = value?.trim().toUpperCase();
  if (normalized === "Y" || normalized === "가능") return "Y";
  if (normalized === "N1") return "N1";
  if (
    normalized === "N" ||
    normalized === "불가" ||
    normalized === "UNAVAILABLE"
  ) {
    return "N";
  }
  if (!normalized || normalized === "정보미제공") return "UNKNOWN";
  return "UNKNOWN";
}

function numberOrUndefined(value?: string) {
  if (value === undefined || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function validCoordinate(value?: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function joinRegionData({
  region,
  hospitals,
  traumaCenters,
  beds,
  acceptance,
}: {
  region: string;
  hospitals: RawHospital[];
  traumaCenters: RawHospital[];
  beds: RawRealtimeBeds[];
  acceptance: RawAcceptance[];
}): HospitalSnapshot[] {
  const bedsById = new Map(
    beds.filter((item) => item.hpid).map((item) => [item.hpid!, item]),
  );
  const acceptanceById = new Map(
    acceptance
      .filter((item) => item.hpid)
      .map((item) => [item.hpid!, item]),
  );
  const traumaIds = new Set(
    traumaCenters.map((item) => item.hpid).filter(Boolean),
  );

  return hospitals.flatMap((hospital) => {
    if (!hospital.hpid || !hospital.dutyName) return [];
    const lat = validCoordinate(hospital.wgs84Lat);
    const lng = validCoordinate(hospital.wgs84Lon);
    if (lat === undefined || lng === undefined) return [];

    const liveBeds = bedsById.get(hospital.hpid);
    const liveAcceptance = acceptanceById.get(hospital.hpid);
    const updated = parseHvidate(liveBeds?.hvidate);

    return [
      {
        hpid: hospital.hpid,
        name: hospital.dutyName,
        address: hospital.dutyAddr ?? "",
        region,
        emergencyClassCode: hospital.dutyEmcls,
        emergencyClassName: hospital.dutyEmclsName,
        isTraumaCenter: traumaIds.has(hospital.hpid),
        erPhone: hospital.dutyTel3,
        mainPhone: hospital.dutyTel1,
        lat,
        lng,
        erOperating: hospital.dutyEryn !== "0",
        beds: Object.fromEntries(
          bedFields.map((field) => [
            field,
            numberOrUndefined(liveBeds?.[field]),
          ]),
        ),
        equipment: Object.fromEntries(
          equipmentFields.map((field) => [
            field,
            normalizeAvailability(liveBeds?.[field]),
          ]),
        ),
        acceptance: Object.fromEntries(
          acceptanceFields.map((field) => [
            field,
            normalizeAvailability(liveAcceptance?.[field]),
          ]),
        ),
        basicCapabilities: Object.fromEntries(
          basicCapabilityFields.map((field) => [
            field,
            normalizeAvailability(hospital[field]),
          ]),
        ),
        sourceUpdatedAt: updated?.toISOString(),
        sourceAgeMinutes: sourceAgeMinutes(liveBeds?.hvidate),
        sourceMode: "LIVE" as const,
      },
    ];
  });
}
