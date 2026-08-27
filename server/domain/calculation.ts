export const CALCULATION_VERSION = "water-v2.0.0";
export const LITERS_PER_US_GALLON = 3.785411784;

export type Confidence = "low" | "medium" | "high";
export type Provenance = "measured" | "provider-reported" | "calculated" | "estimated";
export type WaterMetric = "consumption" | "withdrawal";

export interface ModelProfile {
  provider: string;
  model: string;
  energyMethod: "provider-reported" | "benchmark-model" | "fallback-engineering-estimate";
  energyMethodVersion: string;
  inputTokenEnergyKwhPer1k?: number;
  outputTokenEnergyKwhPer1k?: number;
  source: string;
  effectiveDate: string;
}

export interface UsageInput {
  provider?: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  energyKwh?: number;
  waterLiters?: number;
  waterMetric?: WaterMetric;
  provenance?: Provenance;
  pue?: number;
  onsiteWue?: number;
  offsiteWaterIntensity?: number;
  locationSource?: "provider-reported" | "unknown";
  pueEffectiveDate?: string;
  onsiteWueEffectiveDate?: string;
  offsiteWaterEffectiveDate?: string;
}

export interface FootprintResult {
  energyKwh?: number;
  energyMethod: string;
  energyMethodVersion: string;
  energySource: string;
  pue: number;
  pueSource: string;
  pueVersion: string;
  pueEffectiveDate: string;
  onsiteWue: number;
  onsiteWueSource: string;
  onsiteWueVersion: string;
  onsiteWueEffectiveDate: string;
  offsiteWaterIntensity: number;
  offsiteWaterSource: string;
  offsiteWaterVersion: string;
  offsiteWaterEffectiveDate: string;
  locationSource: "provider-reported" | "unknown";
  waterLiters: number;
  waterGallons: number;
  waterUnit: "gal";
  waterMetric: WaterMetric;
  methodology: string;
  methodologyVersion: string;
  source: string;
  confidence: Confidence;
  provenance: Provenance;
  calculatedAt: string;
  limitation: string;
}

const FALLBACK_PUE = 1.20;
const FALLBACK_ONSITE_WUE_L_PER_KWH = 0.30;
const FALLBACK_OFFSITE_INTENSITY_L_PER_KWH = 2.18;
const FALLBACK_INPUT_KWH_PER_1K = 0.0015;
const FALLBACK_OUTPUT_KWH_PER_1K = 0.003;

export const MODEL_PROFILES: readonly ModelProfile[] = [
  { provider: "openai", model: "gpt-4o", energyMethod: "fallback-engineering-estimate", energyMethodVersion: "fallback-1", source: "No model-specific public energy measurement configured; uses documented fallback.", effectiveDate: "2026-08-27" },
  { provider: "anthropic", model: "claude-3-5-sonnet", energyMethod: "fallback-engineering-estimate", energyMethodVersion: "fallback-1", source: "No model-specific public energy measurement configured; uses documented fallback.", effectiveDate: "2026-08-27" },
  { provider: "google", model: "gemini-1.5-pro", energyMethod: "fallback-engineering-estimate", energyMethodVersion: "fallback-1", source: "No model-specific public energy measurement configured; uses documented fallback.", effectiveDate: "2026-08-27" },
];

export function litersToGallons(liters: number): number {
  return Math.max(0, liters) / LITERS_PER_US_GALLON;
}

export function getModelProfile(provider = "", model = ""): ModelProfile | undefined {
  return MODEL_PROFILES.find((profile) => profile.provider === provider && profile.model === model);
}

function round(value: number, places = 6): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

export function calculateFootprint(input: UsageInput): FootprintResult {
  const calculatedAt = new Date().toISOString();
  const explicitMetric = input.waterMetric ?? "consumption";
  if (input.waterLiters !== undefined) {
    return {
      energyKwh: input.energyKwh,
      energyMethod: "provider-reported-or-measured",
      energyMethodVersion: CALCULATION_VERSION,
      energySource: input.provenance === "measured" ? "user-supplied measured energy" : "provider-reported water input",
      pue: input.pue ?? FALLBACK_PUE,
      pueSource: input.pue === undefined ? "fallback not used for direct water input" : "user-supplied",
      pueVersion: CALCULATION_VERSION,
      pueEffectiveDate: input.pueEffectiveDate ?? calculatedAt.slice(0, 10),
      onsiteWue: input.onsiteWue ?? FALLBACK_ONSITE_WUE_L_PER_KWH,
      onsiteWueSource: input.onsiteWue === undefined ? "not used for direct water input" : "user-supplied",
      onsiteWueVersion: CALCULATION_VERSION,
      onsiteWueEffectiveDate: input.onsiteWueEffectiveDate ?? calculatedAt.slice(0, 10),
      offsiteWaterIntensity: input.offsiteWaterIntensity ?? FALLBACK_OFFSITE_INTENSITY_L_PER_KWH,
      offsiteWaterSource: input.offsiteWaterIntensity === undefined ? "not used for direct water input" : "user-supplied",
      offsiteWaterVersion: CALCULATION_VERSION,
      offsiteWaterEffectiveDate: input.offsiteWaterEffectiveDate ?? calculatedAt.slice(0, 10),
      locationSource: input.locationSource ?? "unknown",
      waterLiters: round(Math.max(0, input.waterLiters), 6),
      waterGallons: round(litersToGallons(input.waterLiters), 4),
      waterUnit: "gal",
      waterMetric: explicitMetric,
      methodology: "Direct water input preserved in liters and converted to US gallons for display.",
      methodologyVersion: CALCULATION_VERSION,
      source: "provider-reported or measured input",
      confidence: "high",
      provenance: input.provenance ?? "provider-reported",
      calculatedAt,
      limitation: "This is not a physical meter. Direct water values may use different system boundaries; Byte Drop does not infer missing operational factors for this record.",
    };
  }

  const profile = getModelProfile(input.provider, input.model);
  const hasEnergy = input.energyKwh !== undefined;
  const inputEnergy = (input.inputTokens ?? 0) / 1000 * (profile?.inputTokenEnergyKwhPer1k ?? FALLBACK_INPUT_KWH_PER_1K);
  const outputEnergy = (input.outputTokens ?? 0) / 1000 * (profile?.outputTokenEnergyKwhPer1k ?? FALLBACK_OUTPUT_KWH_PER_1K);
  const energyKwh = Math.max(0, input.energyKwh ?? inputEnergy + outputEnergy);
  const pue = input.pue ?? FALLBACK_PUE;
  const onsiteWue = input.onsiteWue ?? FALLBACK_ONSITE_WUE_L_PER_KWH;
  const offsiteWaterIntensity = input.offsiteWaterIntensity ?? FALLBACK_OFFSITE_INTENSITY_L_PER_KWH;
  const waterLiters = energyKwh * (onsiteWue + pue * offsiteWaterIntensity);
  const usesFallbacks = input.pue === undefined || input.onsiteWue === undefined || input.offsiteWaterIntensity === undefined || !hasEnergy;
  const provenance: Provenance = hasEnergy ? "calculated" : "estimated";
  return {
    energyKwh: round(energyKwh, 9),
    energyMethod: hasEnergy ? "provided-energy" : profile?.energyMethod ?? "fallback-engineering-estimate",
    energyMethodVersion: profile?.energyMethodVersion ?? "fallback-1",
    energySource: hasEnergy ? "user-supplied energy" : profile?.source ?? "Byte Drop engineering fallback; replace with measured or provider-reported energy when available",
    pue,
    pueSource: input.pue === undefined ? "Microsoft FY25 global WUE/PUE context; documented fallback" : "user-supplied",
    pueVersion: input.pue === undefined ? "microsoft-fy25-context" : CALCULATION_VERSION,
    pueEffectiveDate: input.pueEffectiveDate ?? "2025-06-30",
    onsiteWue,
    onsiteWueSource: input.onsiteWue === undefined ? "Microsoft FY25 global WUE context; documented fallback" : "user-supplied",
    onsiteWueVersion: input.onsiteWue === undefined ? "microsoft-fy25-context" : CALCULATION_VERSION,
    onsiteWueEffectiveDate: input.onsiteWueEffectiveDate ?? "2025-06-30",
    offsiteWaterIntensity,
    offsiteWaterSource: input.offsiteWaterIntensity === undefined ? "Mytton 2021 US electricity-generation average; location-independent fallback" : "user-supplied",
    offsiteWaterVersion: input.offsiteWaterIntensity === undefined ? "mytton-2021-context" : CALCULATION_VERSION,
    offsiteWaterEffectiveDate: input.offsiteWaterEffectiveDate ?? "2021-01-01",
    locationSource: input.locationSource ?? "unknown",
    waterLiters: round(waterLiters, 6),
    waterGallons: round(litersToGallons(waterLiters), 4),
    waterUnit: "gal",
    waterMetric: "consumption",
    methodology: "Operational water consumption = IT energy × [onsite WUE + (PUE × offsite electricity water intensity)].",
    methodologyVersion: CALCULATION_VERSION,
    source: usesFallbacks ? "Documented fallback factors with source context" : "User-supplied energy and operational factors",
    confidence: usesFallbacks ? "low" : "medium",
    provenance,
    calculatedAt,
    limitation: "This is not a physical meter. Actual consumption varies by model, hardware, datacenter, cooling system, electricity source, workload, weather, and operating conditions. Unknown location uses a location-independent fallback; embodied water is excluded.",
  };
}

export interface AggregatedFootprint {
  waterLiters: number;
  waterGallons: number;
  recordCount: number;
  confidence: Confidence;
  provenance: Provenance | "mixed";
}

export function aggregateFootprints(results: readonly FootprintResult[]): AggregatedFootprint {
  const provenance = new Set(results.map((result) => result.provenance));
  const confidenceRank: Record<Confidence, number> = { low: 1, medium: 2, high: 3 };
  const lowestConfidence = results.reduce<Confidence>((lowest, result) => confidenceRank[result.confidence] < confidenceRank[lowest] ? result.confidence : lowest, "high");
  return {
    waterLiters: round(results.reduce((sum, result) => sum + result.waterLiters, 0), 6),
    waterGallons: round(results.reduce((sum, result) => sum + result.waterGallons, 0), 4),
    recordCount: results.length,
    confidence: lowestConfidence,
    provenance: provenance.size === 1 ? (results[0]?.provenance ?? "estimated") : "mixed",
  };
}

export const METHODOLOGY_NOTE = "Byte Drop estimates operational water consumption from energy and explicit PUE/WUE/offsite-intensity factors. Actual consumption varies by model, hardware, datacenter, cooling system, electricity source, workload and operating conditions.";
