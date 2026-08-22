import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { XMLParser } from "fast-xml-parser";

const ACCEPTANCE_OPERATION = "getSrsillDissAceptncPosblInfoInqire";
const BED_OPERATION = "getEmrrmRltmUsefulSckbdInfoInqire";
const OUTPUT_PATH = path.resolve("src", "data", "historical-metrics.json");
const parser = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: false,
  trimValues: true,
});

function option(name) {
  const equals = process.argv.find((value) => value.startsWith(`${name}=`));
  if (equals) return equals.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function kstTimestamp(value) {
  const date = value.slice(0, 8);
  const time = value.slice(9);
  return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(
    6,
    8,
  )}T${time.slice(0, 2)}:${time.slice(2, 4)}:${time.slice(4, 6)}+09:00`;
}

function hvidateTimestamp(value) {
  const normalized = String(value ?? "").trim();
  if (!/^\d{14}$/.test(normalized)) return null;
  return `${normalized.slice(0, 4)}-${normalized.slice(
    4,
    6,
  )}-${normalized.slice(6, 8)}T${normalized.slice(
    8,
    10,
  )}:${normalized.slice(10, 12)}:${normalized.slice(12, 14)}+09:00`;
}

function normalizeState(value) {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (normalized === "Y" || normalized === "가능") return "Y";
  if (
    normalized === "N" ||
    normalized === "N1" ||
    normalized === "불가" ||
    normalized === "불가능" ||
    normalized === "UNAVAILABLE"
  ) {
    return "UNAVAILABLE";
  }
  return "UNKNOWN";
}

function responseItems(document, filename) {
  const response = document?.response;
  if (!response) throw new Error(`${filename}: NEMC 응답 구조가 없습니다.`);
  const resultCode = String(response.header?.resultCode ?? "");
  if (resultCode !== "00") {
    throw new Error(
      `${filename}: NEMC 오류 ${resultCode} ${String(
        response.header?.resultMsg ?? "",
      )}`.trim(),
    );
  }
  const item = response.body?.items?.item;
  if (!item) return [];
  return Array.isArray(item) ? item : [item];
}

function hospitalRecord(records, hpid, region) {
  const existing = records.get(hpid);
  if (existing) {
    existing.region = region;
    return existing;
  }
  const created = {
    region,
    treatments: new Map(),
    bed: null,
  };
  records.set(hpid, created);
  return created;
}

function observeTreatment(hospital, code, state, observedAt) {
  let metric = hospital.treatments.get(code);
  if (!metric) {
    metric = {
      observationCount: 0,
      yCount: 0,
      unavailableCount: 0,
      unknownCount: 0,
      transitionCount: 0,
      firstObservedAt: observedAt,
      lastObservedAt: observedAt,
      currentStateSince: observedAt,
      lastObservedState: state,
    };
    hospital.treatments.set(code, metric);
  }
  if (metric.observationCount > 0 && metric.lastObservedAt === observedAt) {
    return;
  }
  if (metric.observationCount > 0 && metric.lastObservedState !== state) {
    metric.transitionCount += 1;
    metric.currentStateSince = observedAt;
  }
  metric.observationCount += 1;
  if (state === "Y") metric.yCount += 1;
  if (state === "UNAVAILABLE") metric.unavailableCount += 1;
  if (state === "UNKNOWN") metric.unknownCount += 1;
  metric.lastObservedState = state;
  metric.lastObservedAt = observedAt;
}

function observeBed(hospital, row, observedAt) {
  const hvec = String(row.hvec ?? "").trim();
  const reportedAt = hvidateTimestamp(row.hvidate);
  if (!hospital.bed) {
    hospital.bed = {
      observationCount: 0,
      transitionCount: 0,
      firstObservedAt: observedAt,
      lastObservedAt: observedAt,
      lastReportedAt: reportedAt,
      lastHvec: null,
    };
  }
  const metric = hospital.bed;
  if (metric.observationCount > 0 && metric.lastObservedAt === observedAt) {
    return;
  }
  if (hvec) {
    if (
      metric.observationCount > 0 &&
      metric.lastHvec !== null &&
      metric.lastHvec !== hvec
    ) {
      metric.transitionCount += 1;
    }
    metric.observationCount += 1;
    metric.lastHvec = hvec;
  }
  metric.lastObservedAt = observedAt;
  if (
    reportedAt &&
    (!metric.lastReportedAt || reportedAt > metric.lastReportedAt)
  ) {
    metric.lastReportedAt = reportedAt;
  }
}

function percentage(count, total) {
  return Math.round((count / total) * 1000) / 10;
}

const sourceOption = option("--source") ?? process.env.HISTORICAL_DATA_DIR;
if (!sourceOption) {
  throw new Error(
    '--source "NEMC XML 폴더" 또는 HISTORICAL_DATA_DIR가 필요합니다.',
  );
}

const sourceDirectory = path.resolve(sourceOption);
const outputPath = path.resolve(option("--output") ?? OUTPUT_PATH);
const filenames = await readdir(sourceDirectory);
const files = filenames.flatMap((filename) => {
  const match = filename.match(
    /^(getSrsillDissAceptncPosblInfoInqire|getEmrrmRltmUsefulSckbdInfoInqire)__(.+)__(\d{8}_\d{6})\.xml$/u,
  );
  if (!match) return [];
  return [
    {
      filename,
      operation: match[1],
      region: match[2],
      observedAt: kstTimestamp(match[3]),
    },
  ];
});
files.sort(
  (left, right) =>
    left.observedAt.localeCompare(right.observedAt) ||
    left.filename.localeCompare(right.filename),
);

const records = new Map();
const regions = new Set();
const snapshots = { acceptance: 0, beds: 0 };
let observedFrom = null;
let observedTo = null;

for (const file of files) {
  const xml = await readFile(path.join(sourceDirectory, file.filename), "utf8");
  let document;
  try {
    document = parser.parse(xml);
  } catch (error) {
    throw new Error(
      `${file.filename}: XML 파싱 실패 - ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  const items = responseItems(document, file.filename);
  regions.add(file.region);

  if (file.operation === ACCEPTANCE_OPERATION) {
    snapshots.acceptance += 1;
    observedFrom =
      observedFrom === null || file.observedAt < observedFrom
        ? file.observedAt
        : observedFrom;
    observedTo =
      observedTo === null || file.observedAt > observedTo
        ? file.observedAt
        : observedTo;
    for (const row of items) {
      const hpid = String(row.hpid ?? "").trim();
      if (!hpid) continue;
      const hospital = hospitalRecord(records, hpid, file.region);
      for (let index = 1; index <= 27; index += 1) {
        const code = `MKioskTy${index}`;
        observeTreatment(
          hospital,
          code,
          normalizeState(row[code]),
          file.observedAt,
        );
      }
    }
  } else if (file.operation === BED_OPERATION) {
    snapshots.beds += 1;
    for (const row of items) {
      const hpid = String(row.hpid ?? "").trim();
      if (!hpid) continue;
      observeBed(
        hospitalRecord(records, hpid, file.region),
        row,
        file.observedAt,
      );
    }
  }
}

if (!observedFrom || !observedTo || snapshots.acceptance === 0) {
  throw new Error("유효한 중증질환 수용정보 XML을 찾지 못했습니다.");
}

const hospitals = {};
for (const hpid of [...records.keys()].sort()) {
  const record = records.get(hpid);
  const treatments = {};
  for (const code of [...record.treatments.keys()].sort((left, right) => {
    return Number(left.slice(8)) - Number(right.slice(8));
  })) {
    const metric = record.treatments.get(code);
    treatments[code] = {
      observationCount: metric.observationCount,
      yCount: metric.yCount,
      unavailableCount: metric.unavailableCount,
      unknownCount: metric.unknownCount,
      yPercent: percentage(metric.yCount, metric.observationCount),
      unknownPercent: percentage(metric.unknownCount, metric.observationCount),
      transitionCount: metric.transitionCount,
      firstObservedAt: metric.firstObservedAt,
      lastObservedAt: metric.lastObservedAt,
      currentStateSince: metric.currentStateSince,
      lastObservedState: metric.lastObservedState,
    };
  }
  const bed =
    record.bed && record.bed.observationCount > 0
      ? {
          observationCount: record.bed.observationCount,
          transitionCount: record.bed.transitionCount,
          firstObservedAt: record.bed.firstObservedAt,
          lastObservedAt: record.bed.lastObservedAt,
          lastReportedAt: record.bed.lastReportedAt,
        }
      : null;
  hospitals[hpid] = {
    region: record.region,
    treatments,
    bed,
  };
}

const output = {
  version: 1,
  generatedAt: new Date().toISOString(),
  source: {
    provider: "NEMC",
    regions: [...regions].sort(),
    observedFrom,
    observedTo,
    snapshots,
    hospitalCount: Object.keys(hospitals).length,
  },
  hospitals,
};

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(
  JSON.stringify({
    output: outputPath,
    hospitals: output.source.hospitalCount,
    regions: output.source.regions,
    observedFrom,
    observedTo,
    snapshots,
  }),
);
