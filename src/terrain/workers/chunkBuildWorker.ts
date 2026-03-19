import { ProceduralGenerator } from "../ProceduralGenerator";
import { PackedTerrainSnapshot, unpackTerrainSnapshot } from "../TerrainSnapshotLayout";
import { TerrainChunkData } from "../TerrainChunkData";
import {
  BuildChunkSuccessResponse,
  ChunkBuildErrorResponse,
  ChunkBuildWorkerRequest,
  ChunkBuildWorkerResponse,
  ChunkBuildReadyResponse,
  SerializedTerrainPoi,
  SerializedTerrainRoad
} from "../TerrainBuildMessages";
import { TerrainConfig } from "../TerrainConfig";
import { TerrainMeshBuilder } from "../TerrainMeshBuilder";
import { TerrainPoi } from "../TerrainPoiPlanner";
import { TerrainRoad } from "../TerrainRoadPlanner";

const workerScope = globalThis as typeof globalThis & {
  onmessage: ((event: MessageEvent<ChunkBuildWorkerRequest>) => void) | null;
  postMessage: (
    message: ChunkBuildWorkerResponse,
    transfer?: Transferable[]
  ) => void;
};

let cachedBuildVersion = -1;
let cachedConfig: TerrainConfig | null = null;
let cachedPoiSites: TerrainPoi[] = [];
let cachedRoads: TerrainRoad[] = [];
let cachedGenerator: ProceduralGenerator | null = null;

workerScope.onmessage = (event: MessageEvent<ChunkBuildWorkerRequest>) => {
  const message = event.data;

  try {
    if (message.type === "prepareChunkBuild") {
      cachedBuildVersion = message.buildVersion;
      cachedConfig = message.config;
      cachedPoiSites = deserializePoiSites(message.poiSites);
      cachedRoads = deserializeRoads(message.roads);
      cachedGenerator = new ProceduralGenerator(
        message.config,
        unpackTerrainSnapshot(message.snapshot as PackedTerrainSnapshot)
      );
      const response: ChunkBuildReadyResponse = {
        type: "chunkBuildReady",
        buildVersion: message.buildVersion
      };
      workerScope.postMessage(response satisfies ChunkBuildWorkerResponse);
      return;
    }

    if (
      message.type !== "buildChunk" ||
      !cachedConfig ||
      !cachedGenerator ||
      message.buildVersion !== cachedBuildVersion
    ) {
      throw new Error("Chunk worker received a build request before preparation.");
    }

    const chunkData = new TerrainChunkData(
      message.chunkX,
      message.chunkZ,
      cachedConfig,
      cachedGenerator,
      cachedRoads,
      cachedPoiSites
    );
    const meshes = message.lods.map((lod) => {
      const meshData = TerrainMeshBuilder.createChunkMeshData(chunkData, lod, cachedConfig!);
      return {
        lod,
        positions: toTransferBuffer(meshData.positions),
        indices: toTransferBuffer(meshData.indices),
        normals: toTransferBuffer(meshData.normals),
        uvs: toTransferBuffer(meshData.uvs),
        uvs2: toTransferBuffer(meshData.uvs2),
        uvs3: toTransferBuffer(meshData.uvs3),
        uvs4: toTransferBuffer(meshData.uvs4),
        colors: toTransferBuffer(meshData.colors)
      };
    });
    const transfer = meshes.flatMap((mesh) => [
      mesh.positions,
      mesh.indices,
      mesh.normals,
      mesh.uvs,
      mesh.uvs2,
      mesh.uvs3,
      mesh.uvs4,
      mesh.colors
    ]);
    const response: BuildChunkSuccessResponse = {
      type: "chunkBuilt",
      buildVersion: message.buildVersion,
      chunkX: message.chunkX,
      chunkZ: message.chunkZ,
      meshes
    };
    workerScope.postMessage(response satisfies ChunkBuildWorkerResponse, transfer);
  } catch (error) {
    const failedChunk =
      message.type === "buildChunk"
        ? { chunkX: message.chunkX, chunkZ: message.chunkZ }
        : { chunkX: -1, chunkZ: -1 };
    const response: ChunkBuildErrorResponse = {
      type: "chunkBuildError",
      buildVersion: message.buildVersion,
      chunkX: failedChunk.chunkX,
      chunkZ: failedChunk.chunkZ,
      message: error instanceof Error ? error.message : String(error)
    };
    workerScope.postMessage(response satisfies ChunkBuildWorkerResponse);
  }
};

function deserializeRoads(roads: readonly SerializedTerrainRoad[]): TerrainRoad[] {
  return roads.map((road) => ({
    id: road.id,
    fromPoiId: road.fromPoiId,
    toPoiId: road.toPoiId,
    cost: road.cost,
    points: road.points.map((point) => ({
      x: point.x,
      y: point.y,
      z: point.z
    }))
  }));
}

function deserializePoiSites(poiSites: readonly SerializedTerrainPoi[]): TerrainPoi[] {
  return poiSites.map((site) => ({
    id: site.id,
    kind: site.kind,
    x: site.x,
    y: site.y,
    z: site.z,
    score: site.score,
    radius: site.radius,
    tags: [...site.tags]
  }));
}

function toTransferBuffer(array: ArrayBufferView): ArrayBuffer {
  const { buffer, byteOffset, byteLength } = array;
  if (byteOffset === 0 && byteLength === buffer.byteLength && buffer instanceof ArrayBuffer) {
    return buffer;
  }
  return buffer.slice(byteOffset, byteOffset + byteLength) as ArrayBuffer;
}

export {};
