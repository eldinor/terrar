import { TerrainConfig } from "./TerrainConfig";
import {
  ProceduralGenerator,
} from "./ProceduralGenerator";
import { packTerrainSnapshot } from "./TerrainSnapshotLayout";
import { TerrainPoiPlanner } from "./TerrainPoiPlanner";
import { TerrainRoadPlanner } from "./TerrainRoadPlanner";
import {
  SerializedTerrainPoi,
  SerializedTerrainRoad,
  SerializedWorldBuildData
} from "./TerrainBuildMessages";

export function buildSerializedWorldData(
  config: TerrainConfig,
  preferSharedSnapshot = false
): SerializedWorldBuildData {
  if (!config.features.poi) {
    const generator = new ProceduralGenerator(config);
    return {
      poiSites: [],
      roads: [],
      snapshot: {
        ...packTerrainSnapshot(generator.createSnapshot(), preferSharedSnapshot),
        shared: preferSharedSnapshot && typeof SharedArrayBuffer !== "undefined"
      }
    };
  }

  const generator = new ProceduralGenerator(config);
  const poiSites = new TerrainPoiPlanner(config, generator)
    .generateSites()
    .map<SerializedTerrainPoi>((site) => ({
      id: site.id,
      kind: site.kind,
      x: site.x,
      y: site.y,
      z: site.z,
      score: site.score,
      radius: site.radius,
      tags: [...site.tags]
    }));

  const roads = config.features.roads
    ? new TerrainRoadPlanner(config, generator)
        .generateRoads(poiSites)
        .map<SerializedTerrainRoad>((road) => ({
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
    snapshot: {
      ...packTerrainSnapshot(generator.createSnapshot(), preferSharedSnapshot),
      shared: preferSharedSnapshot && typeof SharedArrayBuffer !== "undefined"
    }
  };
}
