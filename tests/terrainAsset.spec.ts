import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  TERRAIN_ASSET_VERSION,
  createSerializedTerrainAsset,
  deserializeTerrainAsset,
  serializeTerrainAsset,
  validateSerializedTerrainAsset,
} from "../src/builder/terrainAsset";
import { buildTerrain } from "../src/builder/buildTerrain";
import {
  createCombinedResourceMap,
  createCombinedWaterMap,
  createTerrainByteMap,
  createTerrainHeightmap,
  exportTerrainMaps,
  exportTerrainPoiData,
  exportTerrainRoadData,
} from "../src/builder/terrainMaps";
import {
  createTerrainExportBundle,
  encodeGrayscalePng,
  encodePortableGraymap,
  encodeRgbaPng,
  encodeTerrainExportFiles,
  TERRAIN_EXPORT_BUNDLE_VERSION,
} from "../src/builder/terrainExportBundle";
import {
  exportTerrainAssetToFolder,
  exportTerrainAssetToZip,
} from "../src/builder/terrainExportWriter";
import { runTerrainExportCli } from "../src/builder/terrainExportCli";

describe("terrain asset serialization", () => {
  it("round-trips a built terrain asset through JSON serialization", { timeout: 15000 }, () => {
    const terrain = buildTerrain({
      seed: "asset-roundtrip",
      worldMin: -128,
      worldMax: 128,
      chunksPerAxis: 4,
      chunkSize: 64,
      features: {
        poi: false,
        roads: false,
      },
    });

    const serialized = serializeTerrainAsset(terrain);
    const restored = deserializeTerrainAsset(serialized);

    expect(restored.config).toEqual(terrain.config);
    expect(restored.poiSites).toEqual(terrain.poiSites);
    expect(restored.roads).toEqual(terrain.roads);
    expect(restored.packedSnapshot.analysisResolution).toBe(
      terrain.packedSnapshot.analysisResolution,
    );
    expect(restored.packedSnapshot.analysisStep).toBe(
      terrain.packedSnapshot.analysisStep,
    );
    expect(restored.packedSnapshot.shared).toBe(false);
    expect(new Uint8Array(restored.packedSnapshot.buffer)).toEqual(
      new Uint8Array(terrain.packedSnapshot.buffer),
    );
  });

  it("creates a versioned serialized asset payload", () => {
    const terrain = buildTerrain({ seed: "asset-version" });
    const asset = createSerializedTerrainAsset(terrain);

    expect(asset.version).toBe(TERRAIN_ASSET_VERSION);
    expect(asset.terrain.config).toEqual(terrain.config);
    expect(asset.terrain.packedSnapshot.bufferBase64.length).toBeGreaterThan(0);
  });

  it("rejects unsupported asset versions", () => {
    expect(() =>
      validateSerializedTerrainAsset({
        version: 999,
        terrain: {
          config: {},
          poiSites: [],
          roads: [],
          packedSnapshot: {
            analysisResolution: 1,
            analysisStep: 1,
            shared: false,
            bufferBase64: "",
            fields: {},
          },
        },
      }),
    ).toThrow("Invalid terrain asset payload.");
  });

  it("exports normalized terrain maps from the packed snapshot", () => {
    const terrain = buildTerrain({
      seed: "asset-maps",
      worldMin: -128,
      worldMax: 128,
      chunksPerAxis: 4,
      chunkSize: 64,
    });

    const heightmap = createTerrainHeightmap(terrain);
    const rivermap = createTerrainByteMap(terrain, "river", {
      minValue: 0,
      maxValue: 1,
    });

    expect(heightmap.width).toBe(terrain.packedSnapshot.analysisResolution);
    expect(heightmap.height).toBe(terrain.packedSnapshot.analysisResolution);
    expect(heightmap.minValue).toBe(terrain.config.baseHeight);
    expect(heightmap.maxValue).toBe(terrain.config.maxHeight);
    expect(heightmap.pixels.length).toBe(heightmap.width * heightmap.height);
    expect(Math.max(...heightmap.pixels)).toBeGreaterThan(0);

    expect(rivermap.pixels.length).toBe(rivermap.width * rivermap.height);
    expect(rivermap.minValue).toBe(0);
    expect(rivermap.maxValue).toBe(1);
    expect(Math.max(...rivermap.pixels)).toBeGreaterThanOrEqual(0);
  });

  it("exports a standard terrain map bundle plus poi and road data", { timeout: 15000 }, () => {
    const terrain = buildTerrain({
      seed: "asset-bundle",
      worldMin: -128,
      worldMax: 128,
      chunksPerAxis: 4,
      chunkSize: 64,
      features: {
        poi: true,
        roads: true,
      },
    });

    const bundle = exportTerrainMaps(terrain);
    const poiData = exportTerrainPoiData(terrain);
    const roadData = exportTerrainRoadData(terrain);
    const combinedWaterMap = createCombinedWaterMap(terrain);
    const combinedResourceMap = createCombinedResourceMap(terrain);

    expect(bundle.heightmap.field).toBe("terrainHeight");
    expect(bundle.flowMap.field).toBe("flow");
    expect(bundle.riverMap.field).toBe("river");
    expect(bundle.lakeMap.field).toBe("lake");
    expect(bundle.sedimentMap.field).toBe("sediment");
    expect(bundle.resourceMaps.coal.field).toBe("coal");
    expect(bundle.resourceMaps.iron.field).toBe("iron");
    expect(bundle.resourceMaps.copper.field).toBe("copper");
    expect(bundle.combinedMaps.water).toEqual(combinedWaterMap);
    expect(bundle.combinedMaps.resources).toEqual(combinedResourceMap);
    expect(bundle.combinedMaps.water.pixels.length).toBe(
      bundle.riverMap.width * bundle.riverMap.height * 4,
    );
    expect(bundle.combinedMaps.resources.pixels.length).toBe(
      bundle.resourceMaps.coal.width * bundle.resourceMaps.coal.height * 4,
    );

    expect(poiData.version).toBe(1);
    expect(poiData.poiSites).toEqual(terrain.poiSites);
    expect(roadData.version).toBe(1);
    expect(roadData.roads).toEqual(terrain.roads);
  });

  it("creates a top-level terrain export bundle and encodes file-ready outputs", { timeout: 15000 }, () => {
    const terrain = buildTerrain({
      seed: "asset-export-bundle",
      worldMin: -128,
      worldMax: 128,
      chunksPerAxis: 4,
      chunkSize: 64,
      features: {
        poi: true,
        roads: true,
      },
    });

    const bundle = createTerrainExportBundle(terrain);
    const files = encodeTerrainExportFiles(bundle);
    const heightmapPng = encodeGrayscalePng(bundle.maps.heightmap);
    const combinedWaterPng = encodeRgbaPng(bundle.maps.combinedMaps.water);
    const heightmapFile = encodePortableGraymap(bundle.maps.heightmap);

    expect(bundle.manifest.version).toBe(TERRAIN_EXPORT_BUNDLE_VERSION);
    expect(bundle.manifest.terrainAssetVersion).toBe(TERRAIN_ASSET_VERSION);
    expect(bundle.terrainAsset.version).toBe(TERRAIN_ASSET_VERSION);
    expect(bundle.terrainAssetJson.length).toBeGreaterThan(0);
    expect(bundle.poiDataJson.length).toBeGreaterThan(0);
    expect(bundle.roadDataJson.length).toBeGreaterThan(0);
    expect(bundle.manifest.mapNames).toContain("heightmap");
    expect(bundle.manifest.mapNames).toContain("combinedMaps.water");
    expect(bundle.manifest.mapNames).toContain("combinedMaps.resources");

    expect(files.manifestJson.length).toBeGreaterThan(0);
    expect(files.terrainAssetJson).toBe(bundle.terrainAssetJson);
    expect(files.poiDataJson).toBe(bundle.poiDataJson);
    expect(files.roadDataJson).toBe(bundle.roadDataJson);
    expect(Object.keys(files.mapFiles)).toContain("heightmap.png");
    expect(Object.keys(files.mapFiles)).toContain("water-combined.png");
    expect(Object.keys(files.mapFiles)).toContain("resources-combined.png");
    expect(files.mapFiles["heightmap.png"].length).toBeGreaterThan(0);
    expect(files.mapFiles["water-combined.png"].length).toBeGreaterThan(0);
    expect(Object.keys(files.portableGraymapFiles)).toContain("heightmap.pgm");
    expect(files.portableGraymapFiles["heightmap.pgm"].length).toBeGreaterThan(
      bundle.maps.heightmap.pixels.length,
    );

    expect(heightmapPng[0]).toBe(137);
    expect(heightmapPng[1]).toBe(80);
    expect(heightmapPng[2]).toBe(78);
    expect(heightmapPng[3]).toBe(71);
    expect(combinedWaterPng[0]).toBe(137);
    expect(combinedWaterPng[1]).toBe(80);
    expect(combinedWaterPng[2]).toBe(78);
    expect(combinedWaterPng[3]).toBe(71);
    expect(heightmapFile[0]).toBe("P".charCodeAt(0));
    expect(heightmapFile[1]).toBe("5".charCodeAt(0));
  });

  it("writes an encoded terrain export bundle to a folder", { timeout: 15000 }, async () => {
    const terrain = buildTerrain({
      seed: "asset-export-folder",
      worldMin: -128,
      worldMax: 128,
      chunksPerAxis: 4,
      chunkSize: 64,
      features: {
        poi: true,
        roads: true,
      },
    });

    const outputDir = await mkdtemp(join(tmpdir(), "terrar-export-"));

    try {
      const written = await exportTerrainAssetToFolder(terrain, outputDir);
      const manifestJson = await readFile(written.layout.manifestFile, "utf8");
      const assetJson = await readFile(written.layout.terrainAssetFile, "utf8");
      const combinedMapPng = await readFile(join(written.layout.mapsDir, "water-combined.png"));

      expect(written.layout.rootDir).toBe(outputDir);
      expect(written.mapFiles).toContain(join(written.layout.mapsDir, "heightmap.png"));
      expect(written.mapFiles).toContain(join(written.layout.mapsDir, "water-combined.png"));
      expect(written.portableGraymapFiles).toContain(
        join(written.layout.portableGraymapsDir, "heightmap.pgm"),
      );
      expect(manifestJson.length).toBeGreaterThan(0);
      expect(assetJson.length).toBeGreaterThan(0);
      expect(combinedMapPng[0]).toBe(137);
      expect(combinedMapPng[1]).toBe(80);
      expect(combinedMapPng[2]).toBe(78);
      expect(combinedMapPng[3]).toBe(71);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it("writes an encoded terrain export bundle to a zip file", { timeout: 15000 }, async () => {
    const terrain = buildTerrain({
      seed: "asset-export-zip",
      worldMin: -128,
      worldMax: 128,
      chunksPerAxis: 4,
      chunkSize: 64,
      features: {
        poi: true,
        roads: true,
      },
    });

    const outputDir = await mkdtemp(join(tmpdir(), "terrar-export-zip-"));
    const zipFile = join(outputDir, "terrain-export.zip");

    try {
      const written = await exportTerrainAssetToZip(terrain, zipFile);
      const zipBytes = await readFile(written.zipFile);
      const zipText = new TextDecoder().decode(zipBytes);

      expect(written.zipFile).toBe(zipFile);
      expect(written.byteLength).toBe(zipBytes.length);
      expect(zipBytes[0]).toBe("P".charCodeAt(0));
      expect(zipBytes[1]).toBe("K".charCodeAt(0));
      expect(zipBytes[2]).toBe(3);
      expect(zipBytes[3]).toBe(4);
      expect(zipText.includes("manifest.json")).toBe(true);
      expect(zipText.includes("maps/water-combined.png")).toBe(true);
      expect(zipText.includes("maps-pgm/heightmap.pgm")).toBe(true);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it("runs the terrain export cli against a config file", { timeout: 15000 }, async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "terrar-export-cli-"));
    const configPath = join(outputDir, "terrain.config.json");
    const exportDir = join(outputDir, "bundle");

    try {
      const config = {
        seed: "asset-export-cli",
        worldMin: -128,
        worldMax: 128,
        chunksPerAxis: 4,
        chunkSize: 64,
        features: {
          poi: true,
          roads: true,
        },
      };

      const configJson = JSON.stringify(config);
      await writeFile(configPath, configJson, "utf8");

      const result = await runTerrainExportCli([
        "--config",
        configPath,
        "--out",
        exportDir,
        "--format",
        "folder",
      ]);

      const manifestJson = await readFile(join(exportDir, "manifest.json"), "utf8");

      expect(result.format).toBe("folder");
      expect(result.outputPath).toBe(exportDir);
      expect(manifestJson.length).toBeGreaterThan(0);
      expect(manifestJson.includes("combinedMaps.water")).toBe(true);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });
});
