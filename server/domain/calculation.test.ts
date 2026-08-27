import { describe, expect, it } from "vitest";
import { CALCULATION_VERSION, LITERS_PER_US_GALLON, aggregateFootprints, calculateFootprint, litersToGallons } from "./calculation";

describe("calculateFootprint", () => {
  it("converts liters to US gallons using the exact conversion", () => {
    expect(litersToGallons(LITERS_PER_US_GALLON)).toBeCloseTo(1, 8);
  });

  it("uses the reproducible energy-first operational water formula", () => {
    const result = calculateFootprint({ energyKwh: 2, pue: 1.1, onsiteWue: 0.2, offsiteWaterIntensity: 2, locationSource: "provider-reported" });
    expect(result.waterLiters).toBeCloseTo(4.8, 6);
    expect(result.waterGallons).toBeCloseTo(4.8 / LITERS_PER_US_GALLON, 3);
    expect(result.provenance).toBe("calculated");
    expect(result.confidence).toBe("medium");
    expect(result.waterMetric).toBe("consumption");
    expect(result.methodologyVersion).toBe(CALCULATION_VERSION);
  });

  it("uses an explicit low-confidence fallback when only token counts are available", () => {
    const result = calculateFootprint({ provider: "openai", model: "gpt-4o", inputTokens: 1000, outputTokens: 500 });
    expect(result.energyKwh).toBeCloseTo(0.003, 8);
    expect(result.provenance).toBe("estimated");
    expect(result.confidence).toBe("low");
    expect(result.energySource).toContain("fallback");
    expect(result.limitation).toContain("not a physical meter");
  });

  it("preserves directly supplied water and metric semantics", () => {
    const result = calculateFootprint({ waterLiters: 10, waterMetric: "withdrawal", provenance: "provider-reported" });
    expect(result.waterGallons).toBeCloseTo(10 / LITERS_PER_US_GALLON, 3);
    expect(result.waterMetric).toBe("withdrawal");
    expect(result.provenance).toBe("provider-reported");
    expect(result.confidence).toBe("high");
  });

  it("returns zero for an explicit zero measurement without inventing water", () => {
    const result = calculateFootprint({ energyKwh: 0, pue: 1.1, onsiteWue: 0.2, offsiteWaterIntensity: 2 });
    expect(result.waterLiters).toBe(0);
    expect(result.waterGallons).toBe(0);
  });

  it("keeps fallback model profiles explicit instead of pretending model-specific evidence exists", () => {
    const result = calculateFootprint({ provider: "anthropic", model: "claude-3-5-sonnet", inputTokens: 1000 });
    expect(result.energyMethod).toBe("fallback-engineering-estimate");
    expect(result.energyMethodVersion).toBe("fallback-1");
    expect(result.pueEffectiveDate).toBe("2025-06-30");
    expect(result.onsiteWueEffectiveDate).toBe("2025-06-30");
    expect(result.offsiteWaterEffectiveDate).toBe("2021-01-01");
  });

  it("rounds display gallons to four decimal places while retaining liters reproducibly", () => {
    const result = calculateFootprint({ energyKwh: 1, pue: 1.2, onsiteWue: 0.3, offsiteWaterIntensity: 2.18 });
    expect(result.waterGallons.toString().split(".")[1]?.length ?? 0).toBeLessThanOrEqual(4);
    expect(result.waterLiters).toBeCloseTo(2.916, 6);
  });

  it("aggregates totals deterministically and exposes mixed provenance", () => {
    const calculated = calculateFootprint({ energyKwh: 1, pue: 1, onsiteWue: 0, offsiteWaterIntensity: 2 });
    const estimated = calculateFootprint({ inputTokens: 1000 });
    const total = aggregateFootprints([calculated, estimated]);
    expect(total.recordCount).toBe(2);
    expect(total.waterLiters).toBeCloseTo(calculated.waterLiters + estimated.waterLiters, 6);
    expect(total.waterGallons).toBeCloseTo(calculated.waterGallons + estimated.waterGallons, 4);
    expect(total.provenance).toBe("mixed");
    expect(total.confidence).toBe("low");
  });
});
