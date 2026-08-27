import { z } from "zod";

export const providerSchema = z.enum(["openai", "anthropic", "google", "microsoft", "xai", "perplexity", "mistral", "deepseek", "local"]);

export const usageEventSchema = z.object({
  provider: providerSchema,
  model: z.string().trim().min(1).max(120),
  timestamp: z.coerce.date().refine((date) => date.getTime() <= Date.now() + 60_000, "Timestamp cannot be in the future"),
  inputTokens: z.number().int().nonnegative().max(100_000_000).optional(),
  outputTokens: z.number().int().nonnegative().max(100_000_000).optional(),
  energyKwh: z.number().nonnegative().max(1_000_000).optional(),
  waterLiters: z.number().nonnegative().max(1_000_000).optional(),
  waterMetric: z.enum(["consumption", "withdrawal"]).default("consumption"),
  pue: z.number().min(1).max(5).optional(),
  onsiteWue: z.number().nonnegative().max(100).optional(),
  offsiteWaterIntensity: z.number().nonnegative().max(1000).optional(),
  locationSource: z.enum(["provider-reported", "unknown"]).default("unknown"),
  requestType: z.string().trim().min(1).max(80).default("AI request"),
}).refine((value) => value.inputTokens !== undefined || value.outputTokens !== undefined || value.energyKwh !== undefined || value.waterLiters !== undefined, {
  message: "At least one legitimate usage measurement is required",
});

export type UsageEventInput = z.infer<typeof usageEventSchema>;

export const providerUsageEventSchema = usageEventSchema.extend({
  dataSource: z.enum(["manual", "provider-api", "local-endpoint"]),
}).strict();

export const providerUsageResponseSchema = z.array(providerUsageEventSchema).min(1).max(500);

export interface NormalizedUsageEvent extends z.infer<typeof providerUsageEventSchema> {}

export interface AIProviderAdapter {
  readonly provider: z.infer<typeof providerSchema>;
  readonly displayName: string;
  fetchUsage(): Promise<NormalizedUsageEvent[]>;
}

export const configuredProviderAllowlist = providerSchema.options;

export function isAllowedProvider(value: string): value is z.infer<typeof providerSchema> {
  return (configuredProviderAllowlist as readonly string[]).includes(value);
}
