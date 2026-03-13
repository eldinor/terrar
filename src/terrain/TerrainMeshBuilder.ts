import { Color4 } from "@babylonjs/core/Maths/math.color";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { Scene } from "@babylonjs/core/scene";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TerrainChunkData, TerrainSampleGrid } from "./TerrainChunkData";
import { TerrainConfig, TerrainLODLevel } from "./TerrainConfig";
import {
  createTerrainMaterialConfigForHeightRange,
  TerrainTextureOptions,
  TerrainMaterialFactory
} from "./materials";

export class TerrainMeshBuilder {
  static createChunkMeshData(
    chunkData: TerrainChunkData,
    lod: TerrainLODLevel,
    config: TerrainConfig
  ): TerrainChunkMeshData {
    const grid = chunkData.getGrid(lod);
    return this.createMeshData(chunkData, grid, config);
  }

  static buildChunkMesh(
    scene: Scene,
    chunkData: TerrainChunkData,
    lod: TerrainLODLevel,
    material: ShaderMaterial,
    config: TerrainConfig
  ): Mesh {
    const mesh = new Mesh(
      `terrain-${chunkData.chunkX}-${chunkData.chunkZ}-lod${lod}`,
      scene
    );
    this.applyMeshData(
      mesh,
      this.createChunkMeshData(chunkData, lod, config),
      material
    );
    return mesh;
  }

  static buildChunkMeshFromData(
    scene: Scene,
    chunkData: TerrainChunkData,
    lod: TerrainLODLevel,
    material: ShaderMaterial,
    meshData: TerrainChunkMeshData
  ): Mesh {
    const mesh = new Mesh(
      `terrain-${chunkData.chunkX}-${chunkData.chunkZ}-lod${lod}`,
      scene
    );
    this.applyMeshData(mesh, meshData, material);
    return mesh;
  }

  static createSharedMaterial(
    scene: Scene,
    config: TerrainConfig,
    textureOptions?: TerrainTextureOptions
  ): ShaderMaterial {
    return TerrainMaterialFactory.createTerrainMaterial(
      scene,
      undefined,
      createTerrainMaterialConfigForHeightRange(
        config.baseHeight,
        config.maxHeight
      ),
      textureOptions
    );
  }

  private static applyMeshData(
    mesh: Mesh,
    meshData: TerrainChunkMeshData,
    material: ShaderMaterial
  ): void {
    const vertexData = new VertexData();
    vertexData.positions = Array.from(meshData.positions);
    vertexData.indices = Array.from(meshData.indices);
    vertexData.normals = Array.from(meshData.normals);
    vertexData.uvs = Array.from(meshData.uvs);
    vertexData.uvs2 = Array.from(meshData.uvs2);
    vertexData.uvs3 = Array.from(meshData.uvs3);
    vertexData.uvs4 = Array.from(meshData.uvs4);
    vertexData.colors = Array.from(meshData.colors);
    vertexData.applyToMesh(mesh, true);
    mesh.material = material;
    mesh.isPickable = false;
    mesh.doNotSyncBoundingInfo = false;
    mesh.freezeWorldMatrix();
    mesh.setEnabled(false);
  }

  private static createMeshData(
    chunkData: TerrainChunkData,
    grid: TerrainSampleGrid,
    config: TerrainConfig
  ): TerrainChunkMeshData {
    const positions: number[] = [];
    const indices: number[] = [];
    const uvs: number[] = [];
    const uvs2: number[] = [];
    const uvs3: number[] = [];
    const uvs4: number[] = [];
    const colors: number[] = [];
    const normals: number[] = [];

    const {
      resolution,
      step,
      heights,
      rawHeights,
      erosionDeltas,
      flow,
      river,
      lake,
      sediment
      ,
      coal,
      iron,
      copper
    } = grid;

    for (let z = 0; z < resolution; z += 1) {
      for (let x = 0; x < resolution; x += 1) {
        const index = z * resolution + x;
        const worldX = chunkData.minX + x * step;
        const worldZ = chunkData.minZ + z * step;
        const height = heights[index];
        const rawHeight = rawHeights[index];
        const erosionDelta = erosionDeltas[index];
        const normal = chunkData.sampleSurfaceNormal(worldX, worldZ, step);
        positions.push(worldX, height, worldZ);
        uvs.push(x / (resolution - 1), z / (resolution - 1));
        uvs2.push(
          Math.max(0, Math.min(1, river[index])),
          Math.max(0, Math.min(1, lake[index]))
        );
        uvs3.push(
          Math.max(0, Math.min(1, coal[index])),
          Math.max(0, Math.min(1, iron[index]))
        );
        uvs4.push(
          Math.max(0, Math.min(1, copper[index])),
          0
        );
        normals.push(normal.x, normal.y, normal.z);
        const color = pickVertexColor(
          rawHeight,
          erosionDelta,
          sediment[index],
          flow[index],
          config
        );
        colors.push(color.r, color.g, color.b, color.a);
      }
    }

    for (let z = 0; z < resolution - 1; z += 1) {
      for (let x = 0; x < resolution - 1; x += 1) {
        const a = z * resolution + x;
        const b = a + 1;
        const c = a + resolution;
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }

    appendSkirt(
      positions,
      uvs,
      uvs2,
      uvs3,
      uvs4,
      normals,
      colors,
      indices,
      chunkData,
      grid,
      config,
      "north"
    );
    appendSkirt(
      positions,
      uvs,
      uvs2,
      uvs3,
      uvs4,
      normals,
      colors,
      indices,
      chunkData,
      grid,
      config,
      "south"
    );
    appendSkirt(
      positions,
      uvs,
      uvs2,
      uvs3,
      uvs4,
      normals,
      colors,
      indices,
      chunkData,
      grid,
      config,
      "west"
    );
    appendSkirt(
      positions,
      uvs,
      uvs2,
      uvs3,
      uvs4,
      normals,
      colors,
      indices,
      chunkData,
      grid,
      config,
      "east"
    );

    return {
      positions: new Float32Array(positions),
      indices: new Uint32Array(indices),
      normals: new Float32Array(normals),
      uvs: new Float32Array(uvs),
      uvs2: new Float32Array(uvs2),
      uvs3: new Float32Array(uvs3),
      uvs4: new Float32Array(uvs4),
      colors: new Float32Array(colors)
    };
  }
}

export interface TerrainChunkMeshData {
  readonly positions: Float32Array;
  readonly indices: Uint32Array;
  readonly normals: Float32Array;
  readonly uvs: Float32Array;
  readonly uvs2: Float32Array;
  readonly uvs3: Float32Array;
  readonly uvs4: Float32Array;
  readonly colors: Float32Array;
}

type Edge = "north" | "south" | "west" | "east";

function appendSkirt(
  positions: number[],
  uvs: number[],
  uvs2: number[],
  uvs3: number[],
  uvs4: number[],
  normals: number[],
  colors: number[],
  indices: number[],
  chunkData: TerrainChunkData,
  grid: TerrainSampleGrid,
  config: TerrainConfig,
  edge: Edge
): void {
  const {
    resolution,
    step,
    heights,
    rawHeights,
    erosionDeltas,
    flow,
      river,
      lake,
      sediment,
      coal,
      iron,
      copper
  } = grid;
  const topIndices: number[] = [];
  const skirtIndices: number[] = [];

  for (let sample = 0; sample < resolution; sample += 1) {
    const x = edge === "west" ? 0 : edge === "east" ? resolution - 1 : sample;
    const z = edge === "north" ? 0 : edge === "south" ? resolution - 1 : sample;
    const gridIndex = z * resolution + x;
    const worldX = chunkData.minX + x * step;
    const worldZ = chunkData.minZ + z * step;
    const height = heights[gridIndex];
    const skirtVertexIndex = positions.length / 3;

    topIndices.push(gridIndex);
    skirtIndices.push(skirtVertexIndex);

    positions.push(worldX, height - config.skirtDepth, worldZ);
    uvs.push(x / (resolution - 1), z / (resolution - 1));
    uvs2.push(
      Math.max(0, Math.min(1, river[gridIndex])),
      Math.max(0, Math.min(1, lake[gridIndex]))
    );
    uvs3.push(
      Math.max(0, Math.min(1, coal[gridIndex])),
      Math.max(0, Math.min(1, iron[gridIndex]))
    );
    uvs4.push(
      Math.max(0, Math.min(1, copper[gridIndex])),
      0
    );
    const topNormal = Vector3.FromArray(normals, gridIndex * 3);
    const skirtNormal = createSkirtNormal(topNormal, edge);
    normals.push(skirtNormal.x, skirtNormal.y, skirtNormal.z);

    const color = pickVertexColor(
      rawHeights[gridIndex],
      erosionDeltas[gridIndex],
      sediment[gridIndex],
      flow[gridIndex],
      config
    );
    colors.push(color.r, color.g, color.b, color.a);
  }

  for (let segment = 0; segment < resolution - 1; segment += 1) {
    const topA = topIndices[segment];
    const topB = topIndices[segment + 1];
    const skirtA = skirtIndices[segment];
    const skirtB = skirtIndices[segment + 1];

    if (edge === "north" || edge === "east") {
      indices.push(topA, skirtA, topB, topB, skirtA, skirtB);
    } else {
      indices.push(topA, topB, skirtA, topB, skirtB, skirtA);
    }
  }
}

function createSkirtNormal(topNormal: Vector3, edge: Edge): Vector3 {
  const outward =
    edge === "north"
      ? new Vector3(0, -0.35, -1)
      : edge === "south"
        ? new Vector3(0, -0.35, 1)
        : edge === "west"
          ? new Vector3(-1, -0.35, 0)
          : new Vector3(1, -0.35, 0);

  return topNormal.scale(0.35).add(outward.scale(0.65)).normalize();
}

function pickVertexColor(
  rawHeight: number,
  erosionDelta: number,
  sediment: number,
  flow: number,
  config: TerrainConfig
): Color4 {
  return new Color4(
    normalizeHeight(rawHeight, config),
    normalizeDelta(erosionDelta, config),
    Math.max(0, Math.min(1, sediment)),
    Math.max(0, Math.min(1, flow))
  );
}

function normalizeHeight(height: number, config: TerrainConfig): number {
  return Math.max(
    0,
    Math.min(1, (height - config.baseHeight) / Math.max(config.maxHeight - config.baseHeight, 0.0001))
  );
}

function normalizeDelta(delta: number, config: TerrainConfig): number {
  const span = Math.max(config.maxHeight - config.baseHeight, 1);
  return Math.max(0, Math.min(1, delta / (span * 0.12)));
}
