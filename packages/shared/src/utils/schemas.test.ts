import { describe, expect, test } from "bun:test";
import {
  colorSchema,
  dimensionSchema,
  layoutModeSchema,
  gradientStopSchema,
} from "./schemas.js";

describe("dimensionSchema", () => {
  test("accepts positive numbers", () => {
    expect(dimensionSchema.safeParse(100).success).toBe(true);
    expect(dimensionSchema.safeParse(0.5).success).toBe(true);
  });

  test("rejects zero and negative numbers", () => {
    expect(dimensionSchema.safeParse(0).success).toBe(false);
    expect(dimensionSchema.safeParse(-5).success).toBe(false);
  });
});

describe("colorSchema", () => {
  test("accepts 0-1 channels with optional alpha", () => {
    expect(colorSchema.safeParse({ r: 0, g: 0.5, b: 1 }).success).toBe(true);
    expect(colorSchema.safeParse({ r: 1, g: 1, b: 1, a: 0.3 }).success).toBe(true);
  });

  test("rejects 0-255 style values", () => {
    expect(colorSchema.safeParse({ r: 255, g: 0, b: 0 }).success).toBe(false);
  });
});

describe("layoutModeSchema", () => {
  test("accepts valid modes and rejects invalid ones", () => {
    expect(layoutModeSchema.safeParse("HORIZONTAL").success).toBe(true);
    expect(layoutModeSchema.safeParse("GRID").success).toBe(false);
    expect(layoutModeSchema.safeParse("horizontal").success).toBe(false);
  });
});

describe("gradientStopSchema", () => {
  test("requires position in 0-1", () => {
    const color = { r: 0, g: 0, b: 0 };
    expect(gradientStopSchema.safeParse({ position: 0.5, color }).success).toBe(true);
    expect(gradientStopSchema.safeParse({ position: 1.5, color }).success).toBe(false);
  });
});
