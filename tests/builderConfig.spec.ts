import { describe, expect, it } from "vitest";
import {
  DEFAULT_BUILT_TERRAIN_CONFIG,
  resolveBuiltTerrainConfig,
} from "../src/builder/config";
import { DEFAULT_TERRAIN_CONFIG } from "../src/terrain/TerrainConfig";

describe("default analysis resolution", () => {
  it("uses a higher default builder analysis grid for erosion and rivers", () => {
    expect(DEFAULT_BUILT_TERRAIN_CONFIG.erosion.resolution).toBe(513);
    expect(DEFAULT_BUILT_TERRAIN_CONFIG.rivers.resolution).toBe(513);

    const resolved = resolveBuiltTerrainConfig();
    expect(resolved.erosion.resolution).toBe(513);
    expect(resolved.rivers.resolution).toBe(513);
  });

  it("keeps the runtime terrain config aligned with builder defaults", () => {
    expect(DEFAULT_TERRAIN_CONFIG.erosion.resolution).toBe(513);
    expect(DEFAULT_TERRAIN_CONFIG.rivers.resolution).toBe(513);
  });
});
