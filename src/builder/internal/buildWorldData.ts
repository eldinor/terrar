import { BuiltTerrainConfig, toTerrainConfig } from "../config";
import { ProceduralGenerator } from "../../terrain/ProceduralGenerator";
import {
  TerrainPoi,
  TerrainPoiKind,
  TerrainPoiPlanner
} from "../../terrain/TerrainPoiPlanner";
import { TerrainRoadPlanner } from "../../terrain/TerrainRoadPlanner";
import { packTerrainSnapshot } from "../../terrain/TerrainSnapshotLayout";
import type { BuiltTerrain } from "../types";

interface TerrainPointInput {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

interface TerrainPoiInput {
  readonly id: string;
  readonly kind: BuiltTerrain["poiSites"][number]["kind"];
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly score: number;
  readonly radius: number;
  readonly tags: readonly string[];
}

interface TerrainRoadInput {
  readonly id: string;
  readonly fromPoiId: string;
  readonly toPoiId: string;
  readonly points: readonly TerrainPointInput[];
  readonly cost: number;
}

interface BuiltTerrainSnapshotInput {
  readonly analysisResolution: number;
  readonly analysisStep: number;
  readonly buffer: ArrayBuffer | SharedArrayBuffer;
  readonly shared: boolean;
  readonly fields: BuiltTerrain["packedSnapshot"]["fields"];
}

export interface BuiltTerrainDataInput {
  readonly poiSites: readonly TerrainPoiInput[];
  readonly roads: readonly TerrainRoadInput[];
  readonly snapshot: BuiltTerrainSnapshotInput;
}

export function buildBuilderWorldData(
  config: BuiltTerrainConfig,
  preferSharedSnapshot: boolean
): BuiltTerrainDataInput {
  const terrainConfig = toTerrainConfig(config);
  const generator = new ProceduralGenerator(terrainConfig);
  const snapshot = {
    ...packTerrainSnapshot(generator.createSnapshot(), preferSharedSnapshot),
    shared: preferSharedSnapshot && typeof SharedArrayBuffer !== "undefined"
  };

  if (!config.features.poi) {
    return {
      poiSites: [],
      roads: [],
      snapshot
    };
  }

  const poiSites = new TerrainPoiPlanner(terrainConfig, generator)
    .generateSites()
    .map<TerrainPoiInput>((site) => ({
      id: site.id,
      kind: site.kind,
      x: site.x,
      y: site.y,
      z: site.z,
      score: site.score,
      radius: site.radius,
      tags: [...site.tags]
    }));
  const terrainPoiSites = poiSites.map(toTerrainPoi);

  const roads = config.features.roads
    ? new TerrainRoadPlanner(terrainConfig, generator)
        .generateRoads(terrainPoiSites)
        .map<TerrainRoadInput>((road) => ({
          id: road.id,
          fromPoiId: road.fromPoiId,
          toPoiId: road.toPoiId,
          points: road.points.map((point) => ({
            x: point.x,
            y: point.y,
            z: point.z
          })),
          cost: road.cost
        }))
    : [];

  return {
    poiSites,
    roads,
    snapshot
  };
}

function toTerrainPoi(site: TerrainPoiInput): TerrainPoi {
  return {
    id: site.id,
    kind: toTerrainPoiKind(site.kind),
    x: site.x,
    y: site.y,
    z: site.z,
    score: site.score,
    radius: site.radius,
    tags: [...site.tags]
  };
}

function toTerrainPoiKind(kind: TerrainPoiInput["kind"]): TerrainPoiKind {
  switch (kind) {
    case "village":
      return TerrainPoiKind.Village;
    case "outpost":
      return TerrainPoiKind.Outpost;
    case "mine":
      return TerrainPoiKind.Mine;
  }
}
