import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { createYieldingScheduler, runCoroutineAsync } from "@babylonjs/core/Misc/coroutine";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import "@babylonjs/core/Meshes/thinInstanceMesh";
import { Scene } from "@babylonjs/core/scene";
import { TerrainChunk } from "./TerrainChunk";
import { TerrainConfig } from "./TerrainConfig";
import {
  TerrainFoliageCandidate,
  TerrainFoliageKind,
  TerrainFoliagePlanner
} from "./TerrainFoliagePlanner";

type FoliageLODLevel = 0 | 1 | 2;
type FoliageBatchMap = Record<TerrainFoliageKind, Mesh | null>;
type FoliageMatrixMap = Record<TerrainFoliageKind, number[]>;

interface TerrainFoliageChunk {
  readonly lodMeshes: Record<FoliageLODLevel, FoliageBatchMap>;
  readonly center: Vector3;
  readonly instanceCount: number;
  readonly kindCounts: Record<TerrainFoliageKind, number>;
}

export class TerrainFoliageSystem {
  private readonly chunkFoliage = new Map<string, TerrainFoliageChunk>();
  private readonly prototypeMaterials: StandardMaterial[] = [];
  private prototypes: Record<TerrainFoliageKind, Record<FoliageLODLevel, Mesh>> | null = null;
  private totalInstanceCount = 0;
  private visibleChunkCount = 0;
  private visibleInstanceCount = 0;
  private totalKindCounts: Record<TerrainFoliageKind, number> = createKindCounts();
  private visibleKindCounts: Record<TerrainFoliageKind, number> = createKindCounts();

  constructor(
    private readonly scene: Scene,
    private readonly planner: TerrainFoliagePlanner,
    private readonly config: TerrainConfig
  ) {}

  initialize(chunks: readonly TerrainChunk[]): void {
    if (this.prototypes) {
      return;
    }
    this.createPrototypeMaterials();
    this.prototypes = this.createPrototypes();

    for (const chunk of chunks) {
      this.initializeChunk(chunk);
    }
  }

  initializeAsync(
    chunks: readonly TerrainChunk[],
    abortSignal?: AbortSignal
  ): Promise<void> {
    if (this.prototypes) {
      return Promise.resolve();
    }

    this.createPrototypeMaterials();
    this.prototypes = this.createPrototypes();

    return runCoroutineAsync(
      this.initializeChunksCoroutine(chunks, abortSignal),
      createYieldingScheduler(6),
      abortSignal
    );
  }

  update(cameraPosition: Vector3, visibleRadius: number): void {
    this.visibleChunkCount = 0;
    this.visibleInstanceCount = 0;
    this.visibleKindCounts = createKindCounts();

    for (const foliageChunk of this.chunkFoliage.values()) {
      const dx = cameraPosition.x - foliageChunk.center.x;
      const dz = cameraPosition.z - foliageChunk.center.z;
      const distance = Math.sqrt(dx * dx + dz * dz);
      const enabled = distance < visibleRadius;
      const lod = this.getDesiredLod(distance);
      ([0, 1, 2] as FoliageLODLevel[]).forEach((meshLod) => {
        const lodEnabled = enabled && lod === meshLod;
        setFoliageBatchMapEnabled(foliageChunk.lodMeshes[meshLod], lodEnabled);
      });

      if (enabled) {
        this.visibleChunkCount += 1;
        this.visibleInstanceCount += foliageChunk.instanceCount;
        this.visibleKindCounts[TerrainFoliageKind.Tree] +=
          foliageChunk.kindCounts[TerrainFoliageKind.Tree];
        this.visibleKindCounts[TerrainFoliageKind.Bush] +=
          foliageChunk.kindCounts[TerrainFoliageKind.Bush];
        this.visibleKindCounts[TerrainFoliageKind.Rock] +=
          foliageChunk.kindCounts[TerrainFoliageKind.Rock];
      }
    }
  }

  dispose(): void {
    this.chunkFoliage.forEach(({ lodMeshes }) => {
      disposeFoliageBatchMap(lodMeshes[0]);
      disposeFoliageBatchMap(lodMeshes[1]);
      disposeFoliageBatchMap(lodMeshes[2]);
    });
    this.chunkFoliage.clear();
    this.totalInstanceCount = 0;
    this.visibleChunkCount = 0;
    this.visibleInstanceCount = 0;
    this.totalKindCounts = createKindCounts();
    this.visibleKindCounts = createKindCounts();

    if (this.prototypes) {
      Object.values(this.prototypes).forEach((lodMeshes) => {
        lodMeshes[0].dispose(false, true);
        lodMeshes[1].dispose(false, true);
        lodMeshes[2].dispose(false, true);
      });
      this.prototypes = null;
    }

    this.prototypeMaterials.forEach((material) => material.dispose(false, true));
    this.prototypeMaterials.length = 0;
  }

  private createPrototypeMaterials(): void {
    const treeMaterial = new StandardMaterial("foliage-tree-material", this.scene);
    treeMaterial.diffuseColor = new Color3(0.18, 0.4, 0.18);
    treeMaterial.emissiveColor = new Color3(0.16, 0.28, 0.1);
    treeMaterial.specularColor = Color3.Black();

    const bushMaterial = new StandardMaterial("foliage-bush-material", this.scene);
    bushMaterial.diffuseColor = new Color3(0.56, 0.68, 0.18);
    bushMaterial.emissiveColor = new Color3(0.28, 0.32, 0.08);
    bushMaterial.specularColor = Color3.Black();

    const rockMaterial = new StandardMaterial("foliage-rock-material", this.scene);
    rockMaterial.diffuseColor = new Color3(0.82, 0.56, 0.26);
    rockMaterial.emissiveColor = new Color3(0.34, 0.16, 0.04);
    rockMaterial.specularColor = Color3.Black();

    this.prototypeMaterials.push(treeMaterial, bushMaterial, rockMaterial);
  }

  private initializeChunk(chunk: TerrainChunk): void {
    const candidates = this.planner.generateCandidates(chunk.data);
    const kindCounts = createKindCounts();
    const lodMatrices = createLodMatrices();

    for (const candidate of candidates) {
      kindCounts[candidate.kind] += 1;
      this.appendCandidateToLods(candidate, lodMatrices);
    }

    const lodMeshes = createFoliageBatchMaps();
    ([0, 1, 2] as FoliageLODLevel[]).forEach((lod) => {
      ([TerrainFoliageKind.Tree, TerrainFoliageKind.Bush, TerrainFoliageKind.Rock] as const)
        .forEach((kind) => {
          const prototype = this.prototypes?.[kind]?.[lod];
          if (!prototype) {
            return;
          }

          lodMeshes[lod][kind] = createThinInstanceBatchMesh(
            prototype,
            kind,
            lod,
            `${getFoliageMeshName(kind, lod)}-chunk-${chunk.chunkX}-${chunk.chunkZ}`,
            lodMatrices[lod][kind]
          );
        });
    });

    this.chunkFoliage.set(this.getChunkKey(chunk.chunkX, chunk.chunkZ), {
      lodMeshes,
      center: chunk.center.clone(),
      instanceCount: candidates.length,
      kindCounts
    });
    this.totalInstanceCount += candidates.length;
    this.totalKindCounts[TerrainFoliageKind.Tree] += kindCounts[TerrainFoliageKind.Tree];
    this.totalKindCounts[TerrainFoliageKind.Bush] += kindCounts[TerrainFoliageKind.Bush];
    this.totalKindCounts[TerrainFoliageKind.Rock] += kindCounts[TerrainFoliageKind.Rock];
  }

  private appendCandidateToLods(
    candidate: TerrainFoliageCandidate,
    lodMatrices: Record<FoliageLODLevel, FoliageMatrixMap>
  ): void {
    ([0, 1, 2] as FoliageLODLevel[]).forEach((lod) => {
      const scale = candidate.scale * getLodScaleMultiplier(lod);
      const matrix = Matrix.Compose(
        new Vector3(scale, scale, scale),
        Quaternion.FromEulerAngles(0, candidate.yaw, 0),
        new Vector3(
          candidate.x,
          candidate.y + getFoliageHeightOffset(candidate.kind, lod) * candidate.scale,
          candidate.z
        )
      );
      matrix.copyToArray(
        lodMatrices[lod][candidate.kind],
        lodMatrices[lod][candidate.kind].length
      );
    });
  }

  private *initializeChunksCoroutine(
    chunks: readonly TerrainChunk[],
    abortSignal?: AbortSignal
  ) {
    for (const chunk of chunks) {
      if (abortSignal?.aborted) {
        return;
      }
      this.initializeChunk(chunk);
      yield;
    }
  }

  private createPrototypes(): Record<TerrainFoliageKind, Record<FoliageLODLevel, Mesh>> {
    return {
      [TerrainFoliageKind.Tree]: {
        0: createPrototypeMesh(
          createFoliageMesh(this.scene, TerrainFoliageKind.Tree, 0, "foliage-tree-lod0-prototype"),
          this.prototypeMaterials[TerrainFoliageKind.Tree]
        ),
        1: createPrototypeMesh(
          createFoliageMesh(this.scene, TerrainFoliageKind.Tree, 1, "foliage-tree-lod1-prototype"),
          this.prototypeMaterials[TerrainFoliageKind.Tree]
        ),
        2: createPrototypeMesh(
          createFoliageMesh(this.scene, TerrainFoliageKind.Tree, 2, "foliage-tree-lod2-prototype"),
          this.prototypeMaterials[TerrainFoliageKind.Tree]
        )
      },
      [TerrainFoliageKind.Bush]: {
        0: createPrototypeMesh(
          createFoliageMesh(this.scene, TerrainFoliageKind.Bush, 0, "foliage-bush-lod0-prototype"),
          this.prototypeMaterials[TerrainFoliageKind.Bush]
        ),
        1: createPrototypeMesh(
          createFoliageMesh(this.scene, TerrainFoliageKind.Bush, 1, "foliage-bush-lod1-prototype"),
          this.prototypeMaterials[TerrainFoliageKind.Bush]
        ),
        2: createPrototypeMesh(
          createFoliageMesh(this.scene, TerrainFoliageKind.Bush, 2, "foliage-bush-lod2-prototype"),
          this.prototypeMaterials[TerrainFoliageKind.Bush]
        )
      },
      [TerrainFoliageKind.Rock]: {
        0: createPrototypeMesh(
          createFoliageMesh(this.scene, TerrainFoliageKind.Rock, 0, "foliage-rock-lod0-prototype"),
          this.prototypeMaterials[TerrainFoliageKind.Rock]
        ),
        1: createPrototypeMesh(
          createFoliageMesh(this.scene, TerrainFoliageKind.Rock, 1, "foliage-rock-lod1-prototype"),
          this.prototypeMaterials[TerrainFoliageKind.Rock]
        ),
        2: createPrototypeMesh(
          createFoliageMesh(this.scene, TerrainFoliageKind.Rock, 2, "foliage-rock-lod2-prototype"),
          this.prototypeMaterials[TerrainFoliageKind.Rock]
        )
      }
    };
  }

  private getChunkKey(chunkX: number, chunkZ: number): string {
    return `${chunkX}:${chunkZ}`;
  }

  getStats(): TerrainFoliageStats {
    return {
      totalChunks: this.chunkFoliage.size,
      totalInstances: this.totalInstanceCount,
      visibleChunks: this.visibleChunkCount,
      visibleInstances: this.visibleInstanceCount,
      totalTrees: this.totalKindCounts[TerrainFoliageKind.Tree],
      totalBushes: this.totalKindCounts[TerrainFoliageKind.Bush],
      totalRocks: this.totalKindCounts[TerrainFoliageKind.Rock],
      visibleTrees: this.visibleKindCounts[TerrainFoliageKind.Tree],
      visibleBushes: this.visibleKindCounts[TerrainFoliageKind.Bush],
      visibleRocks: this.visibleKindCounts[TerrainFoliageKind.Rock]
    };
  }

  private getDesiredLod(distance: number): FoliageLODLevel {
    const [lod0Distance, lod1Distance] = this.config.foliageLodDistances;

    if (distance < lod0Distance) {
      return 0;
    }

    if (distance < lod1Distance) {
      return 1;
    }

    return 2;
  }
}

function getFoliageHeightOffset(
  kind: TerrainFoliageKind,
  lod: FoliageLODLevel
): number {
  switch (kind) {
    case TerrainFoliageKind.Tree:
      return lod === 2 ? 1.8 : lod === 1 ? 2.4 : 3;
    case TerrainFoliageKind.Bush:
      return lod === 2 ? 0.45 : lod === 1 ? 0.6 : 1;
    case TerrainFoliageKind.Rock:
      return lod === 2 ? 0.15 : lod === 1 ? 0.2 : 0.3;
  }
}

export interface TerrainFoliageStats {
  readonly totalChunks: number;
  readonly totalInstances: number;
  readonly visibleChunks: number;
  readonly visibleInstances: number;
  readonly totalTrees: number;
  readonly totalBushes: number;
  readonly totalRocks: number;
  readonly visibleTrees: number;
  readonly visibleBushes: number;
  readonly visibleRocks: number;
}

function createKindCounts(): Record<TerrainFoliageKind, number> {
  return {
    [TerrainFoliageKind.Tree]: 0,
    [TerrainFoliageKind.Bush]: 0,
    [TerrainFoliageKind.Rock]: 0
  };
}

function createFoliageBatchMap(): FoliageBatchMap {
  return {
    [TerrainFoliageKind.Tree]: null,
    [TerrainFoliageKind.Bush]: null,
    [TerrainFoliageKind.Rock]: null
  };
}

function createFoliageBatchMaps(): Record<FoliageLODLevel, FoliageBatchMap> {
  return {
    0: createFoliageBatchMap(),
    1: createFoliageBatchMap(),
    2: createFoliageBatchMap()
  };
}

function createFoliageMatrixMap(): FoliageMatrixMap {
  return {
    [TerrainFoliageKind.Tree]: [],
    [TerrainFoliageKind.Bush]: [],
    [TerrainFoliageKind.Rock]: []
  };
}

function createLodMatrices(): Record<FoliageLODLevel, FoliageMatrixMap> {
  return {
    0: createFoliageMatrixMap(),
    1: createFoliageMatrixMap(),
    2: createFoliageMatrixMap()
  };
}

function createPrototypeMesh(mesh: Mesh, material: StandardMaterial): Mesh {
  mesh.material = material;
  mesh.isVisible = false;
  mesh.alwaysSelectAsActiveMesh = false;
  mesh.isPickable = false;
  mesh.receiveShadows = false;
  return mesh;
}

function createThinInstanceBatchMesh(
  prototype: Mesh,
  kind: TerrainFoliageKind,
  lod: FoliageLODLevel,
  name: string,
  matrices: number[]
): Mesh | null {
  if (matrices.length === 0) {
    return null;
  }

  const mesh = createFoliageMesh(prototype.getScene(), kind, lod, name);
  mesh.material = prototype.material;
  mesh.isVisible = true;
  mesh.alwaysSelectAsActiveMesh = true;
  mesh.isPickable = false;
  mesh.receiveShadows = false;
  mesh.thinInstanceSetBuffer("matrix", new Float32Array(matrices), 16, true);
  mesh.thinInstanceRefreshBoundingInfo(true);
  mesh.setEnabled(false);
  return mesh;
}

function setFoliageBatchMapEnabled(batchMap: FoliageBatchMap, enabled: boolean): void {
  Object.values(batchMap).forEach((mesh) => mesh?.setEnabled(enabled));
}

function disposeFoliageBatchMap(batchMap: FoliageBatchMap): void {
  Object.values(batchMap).forEach((mesh) => mesh?.dispose(false, true));
}

function getLodScaleMultiplier(lod: FoliageLODLevel): number {
  switch (lod) {
    case 0:
      return 1;
    case 1:
      return 0.88;
    case 2:
      return 0.76;
  }
}

function createFoliageMesh(
  scene: Scene,
  kind: TerrainFoliageKind,
  lod: FoliageLODLevel,
  name: string
): Mesh {
  switch (kind) {
    case TerrainFoliageKind.Tree:
      return MeshBuilder.CreateCylinder(
        name,
        {
          height: lod === 0 ? 6 : lod === 1 ? 4.8 : 3.6,
          diameterTop: lod === 0 ? 0.2 : lod === 1 ? 0.16 : 0.14,
          diameterBottom: lod === 0 ? 1.8 : lod === 1 ? 1.4 : 1.1,
          tessellation: lod === 0 ? 6 : lod === 1 ? 5 : 4
        },
        scene
      );
    case TerrainFoliageKind.Bush:
      if (lod === 2) {
        return MeshBuilder.CreateBox(name, { size: 1.1 }, scene);
      }
      return MeshBuilder.CreateSphere(
        name,
        { diameter: lod === 0 ? 2 : 1.6, segments: lod === 0 ? 4 : 3 },
        scene
      );
    case TerrainFoliageKind.Rock:
      if (lod === 2) {
        return MeshBuilder.CreateBox(name, { size: 0.6 }, scene);
      }
      return MeshBuilder.CreatePolyhedron(
        name,
        { type: lod === 0 ? 1 : 2, size: lod === 0 ? 1 : 0.8 },
        scene
      );
  }
}

function getFoliageMeshName(
  kind: TerrainFoliageKind,
  lod: FoliageLODLevel
): string {
  switch (kind) {
    case TerrainFoliageKind.Tree:
      return `foliage-tree-lod${lod}`;
    case TerrainFoliageKind.Bush:
      return `foliage-bush-lod${lod}`;
    case TerrainFoliageKind.Rock:
      return `foliage-rock-lod${lod}`;
  }
}
