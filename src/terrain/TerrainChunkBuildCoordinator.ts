import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import {
  ProceduralGenerator,
} from "./ProceduralGenerator";
import {
  PackedTerrainSnapshot,
  unpackTerrainSnapshot
} from "./TerrainSnapshotLayout";
import { TerrainChunkData } from "./TerrainChunkData";
import { TerrainConfig, TerrainLODLevel } from "./TerrainConfig";
import {
  BuildChunkRequest,
  ChunkBuildWorkerResponse,
  PrepareChunkBuildRequest,
  SerializedChunkMeshData,
  SerializedTerrainRoad
} from "./TerrainBuildMessages";
import { TerrainChunkMeshData, TerrainMeshBuilder } from "./TerrainMeshBuilder";
import { TerrainRoad } from "./TerrainRoadPlanner";

export interface TerrainChunkBuildProgress {
  readonly completedChunks: number;
  readonly totalChunks: number;
}

interface PendingChunkJob {
  readonly chunkX: number;
  readonly chunkZ: number;
  readonly lods: readonly TerrainLODLevel[];
  readonly priority: number;
}

interface ActiveWorkerState {
  readonly worker: Worker;
  ready: boolean;
  currentJob: PendingChunkJob | null;
}

export class TerrainChunkBuildCoordinator {
  private readonly workers: ActiveWorkerState[];
  private activeBuildVersion = 0;
  private activeBuildHandlers:
    | {
        readonly onChunkBuilt: (
          chunkX: number,
          chunkZ: number,
          meshes: readonly TerrainChunkMeshData[]
        ) => void;
        readonly onProgress?: (progress: TerrainChunkBuildProgress) => void;
        readonly resolve: () => void;
        readonly reject: (reason?: unknown) => void;
        readonly queue: PendingChunkJob[];
        readonly totalChunks: number;
        completedChunks: number;
      }
    | null = null;
  private pendingReady = new Map<number, { remaining: number; resolve: () => void }>();

  constructor(workerCount = getDefaultWorkerCount()) {
    const count = Math.max(1, workerCount);
    this.workers = Array.from({ length: count }, () => {
      const worker = new Worker(
        new URL("./workers/chunkBuildWorker.ts", import.meta.url),
        { type: "module" }
      );
      const state: ActiveWorkerState = {
        worker,
        ready: false,
        currentJob: null
      };
      worker.onmessage = (event: MessageEvent<ChunkBuildWorkerResponse>) => {
        this.handleWorkerMessage(state, event.data);
      };
      worker.onerror = (event) => {
        this.failActiveBuild(new Error(event.message || "Chunk build worker failed."));
      };
      return state;
    });
  }

  async buildChunks(
    config: TerrainConfig,
    roads: readonly TerrainRoad[],
    snapshot: PackedTerrainSnapshot,
    cameraPosition: Vector3 | null,
    buildVersion: number,
    onChunkBuilt: (
      chunkX: number,
      chunkZ: number,
      meshes: readonly TerrainChunkMeshData[]
    ) => void,
    onProgress?: (progress: TerrainChunkBuildProgress) => void
  ): Promise<void> {
    this.activeBuildVersion = buildVersion;
    const queue = buildChunkQueue(config, cameraPosition);
    const totalChunks = queue.length;

    if (this.workers.length === 0 || typeof Worker === "undefined") {
      onProgress?.({ completedChunks: 0, totalChunks });
      queue.forEach((job, index) => {
        const meshes = buildChunkSynchronously(
          config,
          roads,
          snapshot,
          job.chunkX,
          job.chunkZ,
          job.lods
        );
        onChunkBuilt(job.chunkX, job.chunkZ, meshes);
        onProgress?.({
          completedChunks: index + 1,
          totalChunks
        });
      });
      return;
    }

    this.activeBuildHandlers?.resolve();
    this.activeBuildHandlers = null;
    await this.prepareWorkers(config, roads, snapshot, buildVersion);

    return new Promise<void>((resolve, reject) => {
      this.activeBuildHandlers = {
        onChunkBuilt,
        onProgress,
        resolve,
        reject,
        queue,
        totalChunks,
        completedChunks: 0
      };
      onProgress?.({ completedChunks: 0, totalChunks });
      this.dispatchChunkJobs();
    });
  }

  dispose(): void {
    this.pendingReady.forEach(({ resolve }) => resolve());
    this.pendingReady.clear();
    this.activeBuildHandlers?.resolve();
    this.activeBuildHandlers = null;
    this.workers.forEach(({ worker }) => worker.terminate());
  }

  private async prepareWorkers(
    config: TerrainConfig,
    roads: readonly TerrainRoad[],
    snapshot: PackedTerrainSnapshot,
    buildVersion: number
  ): Promise<void> {
    const serializedRoads = serializeRoads(roads);
    const serializedSnapshot = snapshot;
    this.workers.forEach((state) => {
      state.ready = false;
      state.currentJob = null;
    });
    const readyPromise = new Promise<void>((resolve) => {
      this.pendingReady.set(buildVersion, {
        remaining: this.workers.length,
        resolve
      });
    });
    this.workers.forEach(({ worker }) => {
      const request: PrepareChunkBuildRequest = {
        type: "prepareChunkBuild",
        buildVersion,
        config,
        roads: serializedRoads,
        snapshot: serializedSnapshot
      };
      worker.postMessage(request);
    });
    await readyPromise;
  }

  private dispatchChunkJobs(): void {
    const active = this.activeBuildHandlers;
    if (!active) {
      return;
    }

    this.workers.forEach((state) => {
      if (!state.ready || state.currentJob || active.queue.length === 0) {
        return;
      }

      const job = active.queue.shift()!;
      state.currentJob = job;
      const request: BuildChunkRequest = {
        type: "buildChunk",
        buildVersion: this.activeBuildVersion,
        chunkX: job.chunkX,
        chunkZ: job.chunkZ,
        lods: job.lods
      };
      state.worker.postMessage(request);
    });

    if (
      active.completedChunks >= active.totalChunks &&
      this.workers.every((state) => state.currentJob === null)
    ) {
      active.resolve();
      this.activeBuildHandlers = null;
    }
  }

  private handleWorkerMessage(
    state: ActiveWorkerState,
    message: ChunkBuildWorkerResponse
  ): void {
    if (message.type === "chunkBuildReady") {
      const pending = this.pendingReady.get(message.buildVersion);
      if (!pending) {
        return;
      }
      state.ready = true;
      pending.remaining -= 1;
      if (pending.remaining <= 0) {
        this.pendingReady.delete(message.buildVersion);
        pending.resolve();
      }
      this.dispatchChunkJobs();
      return;
    }

    if (message.buildVersion !== this.activeBuildVersion) {
      state.currentJob = null;
      return;
    }

    const active = this.activeBuildHandlers;
    if (!active) {
      state.currentJob = null;
      return;
    }

    state.currentJob = null;

    if (message.type === "chunkBuildError") {
      active.reject(new Error(message.message));
      this.activeBuildHandlers = null;
      return;
    }

    active.onChunkBuilt(
      message.chunkX,
      message.chunkZ,
      message.meshes.map(deserializeChunkMeshData)
    );
    active.completedChunks += 1;
    active.onProgress?.({
      completedChunks: active.completedChunks,
      totalChunks: active.totalChunks
    });
    this.dispatchChunkJobs();
  }

  private failActiveBuild(error: Error): void {
    this.activeBuildHandlers?.reject(error);
    this.activeBuildHandlers = null;
  }
}

function buildChunkQueue(
  config: TerrainConfig,
  cameraPosition: Vector3 | null
): PendingChunkJob[] {
  const lods = config.lodResolutions.map((_, index) => index as TerrainLODLevel);
  const queue: PendingChunkJob[] = [];
  for (let chunkZ = 0; chunkZ < config.chunksPerAxis; chunkZ += 1) {
    for (let chunkX = 0; chunkX < config.chunksPerAxis; chunkX += 1) {
      queue.push({
        chunkX,
        chunkZ,
        lods,
        priority: computeChunkPriority(
          config,
          chunkX,
          chunkZ,
          cameraPosition
        )
      });
    }
  }
  queue.sort((left, right) => left.priority - right.priority);
  return queue;
}

function computeChunkPriority(
  config: TerrainConfig,
  chunkX: number,
  chunkZ: number,
  cameraPosition: Vector3 | null
): number {
  const stableTieBreak = chunkZ * config.chunksPerAxis + chunkX;
  if (!cameraPosition) {
    return stableTieBreak;
  }

  const halfChunkSize = config.chunkSize * 0.5;
  const centerX = config.worldMin + chunkX * config.chunkSize + halfChunkSize;
  const centerZ = config.worldMin + chunkZ * config.chunkSize + halfChunkSize;
  const dx = centerX - cameraPosition.x;
  const dz = centerZ - cameraPosition.z;
  return dx * dx + dz * dz + stableTieBreak * 1e-3;
}

function serializeRoads(roads: readonly TerrainRoad[]): SerializedTerrainRoad[] {
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

function deserializeChunkMeshData(mesh: SerializedChunkMeshData): TerrainChunkMeshData {
  return {
    positions: new Float32Array(mesh.positions),
    indices: new Uint32Array(mesh.indices),
    normals: new Float32Array(mesh.normals),
    uvs: new Float32Array(mesh.uvs),
    uvs2: new Float32Array(mesh.uvs2),
    colors: new Float32Array(mesh.colors)
  };
}

function buildChunkSynchronously(
  config: TerrainConfig,
  roads: readonly TerrainRoad[],
  snapshot: PackedTerrainSnapshot,
  chunkX: number,
  chunkZ: number,
  lods: readonly TerrainLODLevel[]
): TerrainChunkMeshData[] {
  const generator = new ProceduralGenerator(config, unpackTerrainSnapshot(snapshot));
  const chunkData = new TerrainChunkData(chunkX, chunkZ, config, generator, roads);
  return lods.map((lod) => TerrainMeshBuilder.createChunkMeshData(chunkData, lod, config));
}


function getDefaultWorkerCount(): number {
  if (typeof navigator === "undefined" || !navigator.hardwareConcurrency) {
    return 2;
  }
  return Math.max(1, Math.min(4, navigator.hardwareConcurrency - 1));
}
