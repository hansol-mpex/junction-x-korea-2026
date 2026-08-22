import { XMLParser } from "fast-xml-parser";

const NEMC_BASE_URL =
  "https://apis.data.go.kr/B552657/ErmctInfoInqireService";

type Params = Record<string, string | number | undefined>;

export class NemcApiError extends Error {
  constructor(
    message: string,
    public readonly operation: string,
  ) {
    super(message);
    this.name = "NemcApiError";
  }
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

export class NemcClient {
  private readonly parser = new XMLParser({
    ignoreAttributes: false,
    parseTagValue: false,
    trimValues: true,
  });

  constructor(private readonly apiKey: string) {
    if (!apiKey) throw new Error("NEMC_API_KEY is required");
  }

  private buildUrl(operation: string, params: Params) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== "") query.set(key, String(value));
    }

    const encodedKey = this.apiKey.includes("%")
      ? this.apiKey
      : encodeURIComponent(this.apiKey);
    return `${NEMC_BASE_URL}/${operation}?serviceKey=${encodedKey}&${query.toString()}`;
  }

  private async request<T>(operation: string, params: Params): Promise<T[]> {
    const response = await fetch(this.buildUrl(operation, params), {
      headers: { Accept: "application/xml" },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });

    if (!response.ok) {
      throw new NemcApiError(
        `NEMC HTTP ${response.status} ${response.statusText}`,
        operation,
      );
    }

    const payload = this.parser.parse(await response.text());
    const serviceError = payload?.OpenAPI_ServiceResponse?.cmmMsgHeader;
    if (serviceError) {
      throw new NemcApiError(
        String(
          serviceError.returnAuthMsg ??
            serviceError.errMsg ??
            "공공데이터 인증 오류",
        ),
        operation,
      );
    }

    const header = payload?.response?.header;
    if (header?.resultCode && header.resultCode !== "00") {
      throw new NemcApiError(
        `NEMC ${header.resultCode}: ${header.resultMsg ?? "알 수 없는 오류"}`,
        operation,
      );
    }

    return asArray<T>(payload?.response?.body?.items?.item);
  }

  getHospitalList(region: string) {
    return this.request<RawHospital>(
      "getEgytListInfoInqire",
      this.regionParams(region),
    );
  }

  getTraumaCenterList(region: string) {
    return this.request<RawHospital>(
      "getStrmListInfoInqire",
      this.regionParams(region),
    );
  }

  getRealtimeBeds(region: string) {
    return this.request<RawRealtimeBeds>(
      "getEmrrmRltmUsefulSckbdInfoInqire",
      this.regionParams(region),
    );
  }

  getAcceptance(region: string) {
    return this.request<RawAcceptance>(
      "getSrsillDissAceptncPosblInfoInqire",
      this.regionParams(region),
    );
  }

  private regionParams(region: string) {
    return {
      STAGE1: region,
      pageNo: 1,
      numOfRows: 500,
    };
  }
}

export interface RawHospital {
  hpid?: string;
  dutyName?: string;
  dutyAddr?: string;
  dutyTel1?: string;
  dutyTel3?: string;
  dutyEmcls?: string;
  dutyEmclsName?: string;
  dutyEryn?: string;
  wgs84Lat?: string;
  wgs84Lon?: string;
  MKioskTy1?: string;
  MKioskTy2?: string;
  MKioskTy3?: string;
  MKioskTy4?: string;
  MKioskTy5?: string;
  MKioskTy6?: string;
  MKioskTy7?: string;
  MKioskTy8?: string;
  MKioskTy9?: string;
  MKioskTy10?: string;
  MKioskTy11?: string;
}

export interface RawRealtimeBeds {
  hpid?: string;
  hvidate?: string;
  hvec?: string;
  hvoc?: string;
  hv3?: string;
  hv6?: string;
  hv9?: string;
  hv39?: string;
  hv60?: string;
  hvicc?: string;
  hvctayn?: string;
  hvventiayn?: string;
}

export interface RawAcceptance {
  hpid?: string;
  dutyName?: string;
  MKioskTy3?: string;
  MKioskTy4?: string;
  MKioskTy28?: string;
}
