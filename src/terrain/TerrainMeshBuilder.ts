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
  static buildChunkMesh(
    scene: Scene,
    chunkData: TerrainChunkData,
    lod: TerrainLODLevel,
    material: ShaderMaterial,
    config: TerrainConfig
  ): Mesh {
    const grid = chunkData.getGrid(lod);
    const mesh = new Mesh(
      `terrain-${chunkData.chunkX}-${chunkData.chunkZ}-lod${lod}`,
      scene
    );
    const vertexData = this.createVertexData(chunkData, grid, config);
    vertexData.applyToMesh(mesh, true);
    mesh.material = material;
    mesh.isPickable = false;
    mesh.doNotSyncBoundingInfo = false;
    mesh.freezeWorldMatrix();
    mesh.setEnabled(false);
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

  private static createVertexData(
    chunkData: TerrainChunkData,
    grid: TerrainSampleGrid,
    config: TerrainConfig
  ): VertexData {
    const positions: number[] = [];
    const indices: number[] = [];
    const uvs: number[] = [];
    const uvs2: number[] = [];
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
      normals,
      colors,
      indices,
      chunkData,
      grid,
      config,
      "east"
    );

    const vertexData = new VertexData();
    vertexData.positions = positions;
    vertexData.indices = indices;
    vertexData.normals = normals;
    vertexData.uvs = uvs;
    vertexData.uvs2 = uvs2;
    vertexData.colors = colors;
    return vertexData;
  }
}

type Edge = "north" | "south" | "west" | "east";

function appendSkirt(
  positions: number[],
  uvs: number[],
  uvs2: number[],
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
    sediment
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
