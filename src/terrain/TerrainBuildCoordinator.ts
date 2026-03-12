import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { ProceduralGeneratorSnapshot } from "./ProceduralGenerator";
import { PackedTerrainSnapshot, unpackTerrainSnapshot } from "./TerrainSnapshotLayout";
import { TerrainConfig } from "./TerrainConfig";
import {
  BuildWorldRequest,
  SerializedWorldBuildData,
  WorldBuildWorkerResponse
} from "./TerrainBuildMessages";
import { TerrainPoi } from "./TerrainPoiPlanner";
import { TerrainRoad } from "./TerrainRoadPlanner";
import { buildSerializedWorldData } from "./TerrainWorldBuild";

export interface TerrainPrebuiltWorldData {
  readonly poiSites: readonly TerrainPoi[];
  readonly roads: readonly TerrainRoad[];
  readonly snapshot: ProceduralGeneratorSnapshot;
  readonly packedSnapshot: PackedTerrainSnapshot;
}

export class TerrainBuildCoordinator {
  private readonly worker: Worker | null;
  private readonly preferSharedSnapshot: boolean;
  private readonly pending = new Map<
    number,
    {
      resolve: (value: TerrainPrebuiltWorldData) => void;
      reject: (reason?: unknown) => void;
    }
  >();

  constructor(preferSharedSnapshot = false) {
    this.preferSharedSnapshot = preferSharedSnapshot;
    if (typeof Worker === "undefined") {
      this.worker = null;
      return;
    }

    this.worker = new Worker(
      new URL("./workers/worldBuildWorker.ts", import.meta.url),
      { type: "module" }
    );
    this.worker.onmessage = (event: MessageEvent<WorldBuildWorkerResponse>) => {
      this.handleWorkerMessage(event.data);
    };
    this.worker.onerror = (event) => {
      this.rejectAll(new Error(event.message || "World build worker failed."));
    };
  }

  async buildWorld(
    config: TerrainConfig,
    buildVersion: number
  ): Promise<TerrainPrebuiltWorldData> {
    if (!this.worker) {
      return deserializeWorldBuildData(
        buildSerializedWorldData(config, this.preferSharedSnapshot)
      );
    }

    const request: BuildWorldRequest = {
      type: "buildWorld",
      buildVersion,
      config,
      preferSharedSnapshot: this.preferSharedSnapshot
    };

    return new Promise<TerrainPrebuiltWorldData>((resolve, reject) => {
      this.pending.set(buildVersion, { resolve, reject });
      this.worker!.postMessage(request);
    });
  }

  dispose(): void {
    this.rejectAll(new Error("World build coordinator disposed."));
    this.worker?.terminate();
  }

  private handleWorkerMessage(message: WorldBuildWorkerResponse): void {
    const pending = this.pending.get(message.buildVersion);
    if (!pending) {
      return;
    }

    this.pending.delete(message.buildVersion);
    if (message.type === "worldBuildError") {
      pending.reject(new Error(message.message));
      return;
    }

    pending.resolve(deserializeWorldBuildData(message.data));
  }

  private rejectAll(error: Error): void {
    this.pending.forEach(({ reject }) => reject(error));
    this.pending.clear();
  }
}

function deserializeWorldBuildData(
  data: SerializedWorldBuildData
): TerrainPrebuiltWorldData {
  return {
    poiSites: data.poiSites.map((site) => ({
      ...site,
      tags: [...site.tags]
    })),
    roads: data.roads.map((road) => ({
      id: road.id,
      fromPoiId: road.fromPoiId,
      toPoiId: road.toPoiId,
      cost: road.cost,
      points: road.points.map((point) => new Vector3(point.x, point.y, point.z))
    })),
    snapshot: unpackTerrainSnapshot(data.snapshot as PackedTerrainSnapshot),
    packedSnapshot: data.snapshot as PackedTerrainSnapshot
  };
}
