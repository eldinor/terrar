import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { createYieldingScheduler, runCoroutineAsync } from "@babylonjs/core/Misc/coroutine";
import { Scene } from "@babylonjs/core/scene";
import { TerrainChunk } from "./TerrainChunk";
import { TerrainConfig, TerrainLODLevel } from "./TerrainConfig";
import {
  TerrainChunkBuildCoordinator,
  TerrainChunkBuildProgress
} from "./TerrainChunkBuildCoordinator";
import { PackedTerrainSnapshot } from "./TerrainSnapshotLayout";
import { TerrainChunkMeshData, TerrainMeshBuilder } from "./TerrainMeshBuilder";
import { TerrainPoi } from "./TerrainPoiPlanner";
import { TerrainRoad } from "./TerrainRoadPlanner";

export interface TerrainChunkBuildProfile {
  readonly workerBuildMs: number;
  readonly meshApplyMs: number;
}

export interface TerrainChunkMeshRuntimeOptions {
  readonly coordinator?: TerrainChunkBuildCoordinator | null;
  readonly buildVersion?: number;
  readonly initialCameraPosition?: Vector3 | null;
  readonly onProgress?: (progress: TerrainChunkBuildProgress) => void;
}

export class TerrainChunkMeshRuntime {
  private pendingChunkMeshQueue: PendingChunkMeshBuild[] = [];
  private chunkMeshApplyPromise: Promise<void> | null = null;
  private chunkMeshApplyAbortController: AbortController | null = null;
  private lastChunkBuildDurationMs = 0;
  private lastChunkMeshApplyDurationMs = 0;
  private disposed = false;

  constructor(
    private readonly scene: Scene,
    private readonly config: TerrainConfig,
    private readonly chunks: readonly TerrainChunk[],
    private readonly chunkGrid: readonly TerrainChunk[][],
    private readonly material: ShaderMaterial,
    private readonly options: TerrainChunkMeshRuntimeOptions = {}
  ) {}

  async initialize(
    poiSites: readonly TerrainPoi[],
    roads: readonly TerrainRoad[],
    packedSnapshot: PackedTerrainSnapshot
  ): Promise<void> {
    const coordinator = this.options.coordinator;
    if (!coordinator) {
      this.chunks.forEach((chunk, index) => {
        chunk.initializeMeshes();
        this.options.onProgress?.({
          completedChunks: index + 1,
          totalChunks: this.chunks.length
        });
      });
      return;
    }

    try {
      const chunkBuildStartedAt = performance.now();
      this.chunkMeshApplyAbortController?.abort();
      this.chunkMeshApplyAbortController = new AbortController();
      this.pendingChunkMeshQueue = [];
      this.chunkMeshApplyPromise = null;
      this.lastChunkBuildDurationMs = 0;
      this.lastChunkMeshApplyDurationMs = 0;
      await coordinator.buildChunks(
        this.config,
        poiSites,
        roads,
        packedSnapshot,
        this.options.initialCameraPosition ?? null,
        this.options.buildVersion ?? 0,
        (chunkX, chunkZ, meshes) => {
          if (this.disposed || this.chunkMeshApplyAbortController?.signal.aborted) {
            return;
          }

          this.enqueueChunkMeshBuild(chunkX, chunkZ, meshes);
        },
        (progress) => {
          if (this.disposed) {
            return;
          }
          this.options.onProgress?.(progress);
        }
      );
      this.lastChunkBuildDurationMs = performance.now() - chunkBuildStartedAt;
      await this.chunkMeshApplyPromise;
    } catch (error) {
      console.error("Chunk worker build failed, falling back to main-thread mesh generation.", error);
      if (this.disposed) {
        return;
      }

      this.chunks.forEach((chunk, index) => {
        chunk.initializeMeshes();
        this.options.onProgress?.({
          completedChunks: index + 1,
          totalChunks: this.chunks.length
        });
      });
    }
  }

  dispose(): void {
    this.disposed = true;
    this.chunkMeshApplyAbortController?.abort();
    this.chunkMeshApplyAbortController = null;
    this.pendingChunkMeshQueue = [];
    this.chunkMeshApplyPromise = null;
  }

  getPendingChunkMeshCount(): number {
    return this.pendingChunkMeshQueue.length;
  }

  isApplyingChunkMeshes(): boolean {
    return this.chunkMeshApplyPromise !== null;
  }

  getChunkBuildProfile(): TerrainChunkBuildProfile {
    return {
      workerBuildMs: this.lastChunkBuildDurationMs,
      meshApplyMs: this.lastChunkMeshApplyDurationMs
    };
  }

  private enqueueChunkMeshBuild(
    chunkX: number,
    chunkZ: number,
    meshes: readonly TerrainChunkMeshData[]
  ): void {
    const chunk = this.chunkGrid[chunkZ]?.[chunkX];
    if (!chunk) {
      return;
    }

    meshes.forEach((meshData, index) => {
      this.pendingChunkMeshQueue.push({
        chunk,
        lod: index as TerrainLODLevel,
        meshData
      });
    });

    if (!this.chunkMeshApplyPromise) {
      const abortSignal = this.chunkMeshApplyAbortController?.signal;
      const meshApplyStartedAt = performance.now();
      this.chunkMeshApplyPromise = runCoroutineAsync(
        this.applyPendingChunkMeshesCoroutine(),
        createYieldingScheduler(6),
        abortSignal
      ).finally(() => {
        this.lastChunkMeshApplyDurationMs = performance.now() - meshApplyStartedAt;
        this.chunkMeshApplyPromise = null;
      });
    }
  }

  private *applyPendingChunkMeshesCoroutine() {
    while (this.pendingChunkMeshQueue.length > 0) {
      if (this.disposed) {
        return;
      }

      const pending = this.pendingChunkMeshQueue.shift();
      if (!pending) {
        return;
      }

      const mesh = TerrainMeshBuilder.buildChunkMeshFromData(
        this.scene,
        pending.chunk.data,
        pending.lod,
        this.material,
        pending.meshData
      );
      pending.chunk.setMesh(pending.lod, mesh);
      yield;
    }
  }
}

interface PendingChunkMeshBuild {
  readonly chunk: TerrainChunk;
  readonly lod: TerrainLODLevel;
  readonly meshData: TerrainChunkMeshData;
}
