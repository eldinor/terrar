import { buildSerializedWorldData } from "../terrain/TerrainWorldBuild";
import { PackedTerrainSnapshot } from "../terrain/TerrainSnapshotLayout";
import {
  mergeTerrainConfig,
  TerrainConfig,
  TerrainConfigOverrides
} from "../terrain/TerrainConfig";
import {
  SerializedTerrainPoi,
  SerializedTerrainRoad,
  SerializedWorldBuildData
} from "../terrain/TerrainBuildMessages";
import { BuiltTerrain, BuiltTerrainPoi, BuiltTerrainRoad } from "./types";

export function buildTerrain(
  overrides: TerrainConfigOverrides = {},
  preferSharedSnapshot = false
): BuiltTerrain {
  const config = mergeTerrainConfig(overrides);
  return buildTerrainFromConfig(config, preferSharedSnapshot);
}

export function buildTerrainFromConfig(
  config: TerrainConfig,
  preferSharedSnapshot = false
): BuiltTerrain {
  return builtTerrainFromSerializedData(
    config,
    buildSerializedWorldData(config, preferSharedSnapshot)
  );
}

export function builtTerrainFromSerializedData(
  config: TerrainConfig,
  data: SerializedWorldBuildData
): BuiltTerrain {
  return {
    config,
    poiSites: data.poiSites.map(cloneBuiltTerrainPoi),
    roads: data.roads.map(cloneBuiltTerrainRoad),
    packedSnapshot: data.snapshot as PackedTerrainSnapshot
  };
}

function cloneBuiltTerrainPoi(site: SerializedTerrainPoi): BuiltTerrainPoi {
  return {
    id: site.id,
    kind: site.kind,
    x: site.x,
    y: site.y,
    z: site.z,
    score: site.score,
    radius: site.radius,
    tags: [...site.tags]
  };
}

function cloneBuiltTerrainRoad(road: SerializedTerrainRoad): BuiltTerrainRoad {
  return {
    id: road.id,
    fromPoiId: road.fromPoiId,
    toPoiId: road.toPoiId,
    cost: road.cost,
    points: road.points.map((point) => ({
      x: point.x,
      y: point.y,
      z: point.z
    }))
  };
}
