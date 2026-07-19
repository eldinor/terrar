import { describe, expect, it } from "vitest";
import { DEFAULT_BUILT_TERRAIN_CONFIG, type BuiltTerrain } from "../src/builder";
import { TerrainEditSession } from "../src/terrain/TerrainEditSession";
import { rebuildSerializedWorldDataFromHeight } from "../src/terrain/TerrainWorldBuild";
import { unpackTerrainSnapshot } from "../src/terrain/TerrainSnapshotLayout";
import { toTerrainConfig } from "../src/builder/config";

function createTerrain(): BuiltTerrain {
  const resolution = 5;
  const heights = new Float32Array(resolution * resolution).fill(10);
  const empty = { byteOffset: heights.byteLength, length: 0 };
  return {
    config: {
      ...DEFAULT_BUILT_TERRAIN_CONFIG,
      worldMin: 0,
      worldSize: 4,
      baseHeight: 0,
      maxHeight: 20,
    },
    poiSites: [],
    roads: [],
    packedSnapshot: {
      analysisResolution: resolution,
      analysisStep: 1,
      buffer: heights.buffer,
      shared: false,
      fields: {
        terrainHeightField: { byteOffset: 0, length: heights.length },
        flowField: empty,
        riverField: empty,
        lakeField: empty,
        lakeSurfaceField: empty,
        sedimentField: empty,
        coalField: empty,
        ironField: empty,
        copperField: empty,
      },
    },
  };
}

describe("TerrainEditSession", () => {
  it("raises with falloff and groups a stroke into one undo command", () => {
    const session = new TerrainEditSession(createTerrain());
    session.beginStroke("raise", { x: 2, z: 2 }, { radius: 2, strength: 2, hardness: 0 });
    expect(session.commitStroke()).toBe(true);
    expect(session.getHeightAt({ x: 2, z: 2 })).toBe(12);
    expect(session.getHeightAt({ x: 0, z: 0 })).toBe(10);
    expect(session.getState().canUndo).toBe(true);
    session.undo();
    expect(session.getHeightAt({ x: 2, z: 2 })).toBe(10);
    session.redo();
    expect(session.getHeightAt({ x: 2, z: 2 })).toBe(12);
  });

  it("applies operations to persistent brush and rectangle selections", () => {
    const session = new TerrainEditSession(createTerrain());
    session.paintSelection({ x: 2, z: 2 }, 0.6, 1, "add");
    session.selectRectangle({ x: 0, z: 0 }, { x: 1, z: 1 }, "add");
    expect(session.applyToSelection("lower", 3)).toBe(true);
    expect(session.getHeightAt({ x: 2, z: 2 })).toBe(7);
    expect(session.getHeightAt({ x: 0, z: 0 })).toBe(7);
    expect(session.getHeightAt({ x: 4, z: 4 })).toBe(10);
    expect(session.getState().hasSelection).toBe(true);
  });

  it("smooths from a stable source and clamps edits to configured bounds", () => {
    const session = new TerrainEditSession(createTerrain());
    session.beginStroke("raise", { x: 2, z: 2 }, { radius: 0.6, strength: 100, hardness: 1 });
    session.commitStroke();
    expect(session.getHeightAt({ x: 2, z: 2 })).toBe(20);
    session.beginStroke("smooth", { x: 2, z: 2 }, { radius: 0.6, strength: 1, hardness: 1 });
    session.commitStroke();
    expect(session.getHeightAt({ x: 2, z: 2 })).toBeLessThan(20);
    session.beginStroke("lower", { x: 2, z: 2 }, { radius: 0.6, strength: 100, hardness: 1 });
    session.commitStroke();
    expect(session.getHeightAt({ x: 2, z: 2 })).toBe(0);
  });

  it("never mutates the source terrain buffer", () => {
    const terrain = createTerrain();
    const original = new Float32Array(terrain.packedSnapshot.buffer).slice();
    const session = new TerrainEditSession(terrain);
    session.selectAll();
    session.applyToSelection("raise", 1);
    expect(new Float32Array(terrain.packedSnapshot.buffer)).toEqual(original);
    expect(new Float32Array(session.getTerrain().packedSnapshot.buffer)).not.toEqual(original);
  });

  it("preserves authored heights while rebuilding derived terrain fields", () => {
    const terrain = createTerrain();
    const session = new TerrainEditSession(terrain);
    session.beginStroke("raise", { x: 2, z: 2 }, { radius: 0.6, strength: 3, hardness: 1 });
    session.commitStroke();
    const edited = session.getTerrain();
    const snapshot = unpackTerrainSnapshot(edited.packedSnapshot);
    const rebuilt = rebuildSerializedWorldDataFromHeight(
      toTerrainConfig({ ...edited.config, features: { poi: false, roads: false } }),
      snapshot,
      false,
    );
    const rebuiltSnapshot = unpackTerrainSnapshot(rebuilt.snapshot);
    expect(rebuiltSnapshot.terrainHeightField).toEqual(snapshot.terrainHeightField);
    expect(rebuiltSnapshot.flowField?.length).toBe(snapshot.terrainHeightField?.length);
  });
});
