import type { HospitalSnapshot } from "@/lib/domain/schemas";
import { NemcClient } from "./client";
import { joinRegionData } from "./normalize";

export const candidateRegions = [
  "경상북도",
  "대구광역시",
  "울산광역시",
  "강원특별자치도",
  "충청북도",
  "경상남도",
] as const;

export interface NemcCollectionResult {
  hospitals: HospitalSnapshot[];
  warnings: string[];
}

export async function collectLiveHospitals(
  apiKey: string,
): Promise<NemcCollectionResult> {
  const client = new NemcClient(apiKey);
  const settled = await Promise.allSettled(
    candidateRegions.map(async (region) => {
      const [hospitals, traumaCenters, beds, acceptance] = await Promise.all([
        client.getHospitalList(region),
        client.getTraumaCenterList(region),
        client.getRealtimeBeds(region),
        client.getAcceptance(region),
      ]);
      return joinRegionData({
        region,
        hospitals,
        traumaCenters,
        beds,
        acceptance,
      });
    }),
  );

  const hospitals: HospitalSnapshot[] = [];
  const warnings: string[] = [];

  settled.forEach((result, index) => {
    if (result.status === "fulfilled") {
      hospitals.push(...result.value);
    } else {
      warnings.push(
        `${candidateRegions[index]} 데이터 조회 실패: ${
          result.reason instanceof Error
            ? result.reason.message
            : "알 수 없는 오류"
        }`,
      );
    }
  });

  if (hospitals.length === 0) {
    throw new Error(
      warnings.length > 0
        ? warnings.join(" / ")
        : "NEMC에서 병원 데이터를 받지 못했습니다.",
    );
  }

  return { hospitals, warnings };
}
