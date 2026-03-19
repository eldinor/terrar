import {
  BuiltTerrainConfig,
  BuiltTerrainConfigOverrides,
  resolveBuiltTerrainConfig
} from "./config";
import { buildBuilderWorldData, type BuiltTerrainDataInput } from "./internal/buildWorldData";
import { BuiltTerrain, BuiltTerrainPoi, BuiltTerrainRoad } from "./types";

export function buildTerrain(
  overrides: BuiltTerrainConfigOverrides = {},
  preferSharedSnapshot = false
): BuiltTerrain {
  const config = resolveBuiltTerrainConfig(overrides);
  return buildTerrainFromConfig(config, preferSharedSnapshot);
}

export function buildTerrainFromConfig(
  config: BuiltTerrainConfig,
  preferSharedSnapshot = false
): BuiltTerrain {
  return builtTerrainFromSerializedData(
    config,
    buildBuilderWorldData(config, preferSharedSnapshot)
  );
}

export function builtTerrainFromSerializedData(
  config: BuiltTerrainConfig,
  data: BuiltTerrainDataInput
): BuiltTerrain {
  return {
    config,
    poiSites: data.poiSites.map(cloneBuiltTerrainPoi),
    roads: data.roads.map(cloneBuiltTerrainRoad),
    packedSnapshot: cloneBuiltTerrainSnapshot(data.snapshot)
  };
}

function cloneBuiltTerrainPoi(site: BuiltTerrainDataInput["poiSites"][number]): BuiltTerrainPoi {
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

function cloneBuiltTerrainRoad(road: BuiltTerrainDataInput["roads"][number]): BuiltTerrainRoad {
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

function cloneBuiltTerrainSnapshot(
  snapshot: BuiltTerrainDataInput["snapshot"]
): BuiltTerrain["packedSnapshot"] {
  return {
    analysisResolution: snapshot.analysisResolution,
    analysisStep: snapshot.analysisStep,
    buffer: snapshot.buffer,
    shared: snapshot.shared,
    fields: {
      terrainHeightField: { ...snapshot.fields.terrainHeightField },
      flowField: { ...snapshot.fields.flowField },
      riverField: { ...snapshot.fields.riverField },
      lakeField: { ...snapshot.fields.lakeField },
      lakeSurfaceField: { ...snapshot.fields.lakeSurfaceField },
      sedimentField: { ...snapshot.fields.sedimentField },
      coalField: { ...snapshot.fields.coalField },
      ironField: { ...snapshot.fields.ironField },
      copperField: { ...snapshot.fields.copperField }
    }
  };
}
