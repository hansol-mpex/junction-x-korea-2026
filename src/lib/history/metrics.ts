import { z } from "zod";
import historicalMetrics from "@/data/historical-metrics.json";
import { treatmentAreaLabels, type TreatmentAreaCode } from "@/lib/transfer/catalog";
import type {
  HistoricalDataSource,
  HospitalHistoryEvidence,
} from "@/lib/transfer/schemas";

const TimestampSchema = z.string().datetime({ offset: true });
const TreatmentMetricSchema = z.object({
  observationCount: z.number().int().positive(),
  yCount: z.number().int().nonnegative(),
  unavailableCount: z.number().int().nonnegative(),
  unknownCount: z.number().int().nonnegative(),
  yPercent: z.number().min(0).max(100),
  unknownPercent: z.number().min(0).max(100),
  transitionCount: z.number().int().nonnegative(),
  firstObservedAt: TimestampSchema,
  lastObservedAt: TimestampSchema,
  currentStateSince: TimestampSchema,
  lastObservedState: z.enum(["Y", "UNAVAILABLE", "UNKNOWN"]),
});
const BedMetricSchema = z.object({
  observationCount: z.number().int().positive(),
  transitionCount: z.number().int().nonnegative(),
  firstObservedAt: TimestampSchema,
  lastObservedAt: TimestampSchema,
  lastReportedAt: TimestampSchema.nullable(),
});
const DatasetSchema = z.object({
  version: z.literal(1),
  generatedAt: TimestampSchema,
  source: z.object({
    provider: z.literal("NEMC"),
    regions: z.array(z.string().min(1)).min(1),
    observedFrom: TimestampSchema,
    observedTo: TimestampSchema,
    snapshots: z.object({
      acceptance: z.number().int().positive(),
      beds: z.number().int().nonnegative(),
    }),
    hospitalCount: z.number().int().positive(),
  }),
  hospitals: z.record(
    z.string().min(1),
    z.object({
      region: z.string().min(1),
      treatments: z.record(z.string(), TreatmentMetricSchema),
      bed: BedMetricSchema.nullable(),
    }),
  ),
});

const dataset = DatasetSchema.parse(historicalMetrics);

export const historicalDataSource: HistoricalDataSource = {
  mode: "OBSERVATION_ONLY",
  generatedAt: dataset.generatedAt,
  observedFrom: dataset.source.observedFrom,
  observedTo: dataset.source.observedTo,
  regions: dataset.source.regions,
  hospitalCount: dataset.source.hospitalCount,
};

export function getHospitalHistory(
  hpid: string,
  treatmentCodes: TreatmentAreaCode[],
): HospitalHistoryEvidence | null {
  const record = dataset.hospitals[hpid];
  if (!record) return null;

  const treatments = treatmentCodes.flatMap((code) => {
    const metric = record.treatments[code];
    if (!metric) return [];
    return [
      {
        code,
        label: treatmentAreaLabels[code],
        ...metric,
      },
    ];
  });
  if (treatments.length === 0 && !record.bed) return null;

  const firstObserved = [
    ...treatments.map((metric) => metric.firstObservedAt),
    ...(record.bed ? [record.bed.firstObservedAt] : []),
  ].sort();
  const lastObserved = [
    ...treatments.map((metric) => metric.lastObservedAt),
    ...(record.bed ? [record.bed.lastObservedAt] : []),
  ].sort();

  return {
    region: record.region,
    observedFrom: firstObserved[0],
    observedTo: lastObserved.at(-1)!,
    treatments,
    bed: record.bed,
  };
}
