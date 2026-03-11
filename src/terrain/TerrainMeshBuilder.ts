import { Color4 } from "@babylonjs/core/Maths/math.color";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { Scene } from "@babylonjs/core/scene";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TerrainChunkData, TerrainSampleGrid } from "./TerrainChunkData";
import { TerrainBiome } from "./TerrainBiome";
import { TerrainConfig, TerrainLODLevel } from "./TerrainConfig";
import {
  createTerrainMaterialConfigForHeightRange,
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

  static createSharedMaterial(scene: Scene, config: TerrainConfig): ShaderMaterial {
    return TerrainMaterialFactory.createTerrainMaterial(
      scene,
      undefined,
      createTerrainMaterialConfigForHeightRange(
        config.baseHeight,
        config.maxHeight
      )
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
    const colors: number[] = [];
    const normals: number[] = [];

    const {
      resolution,
      step,
      heights,
      slopes,
      moisture,
      temperature,
      biomes,
      shoreProximity,
      waterDepth
    } = grid;

    for (let z = 0; z < resolution; z += 1) {
      for (let x = 0; x < resolution; x += 1) {
        const index = z * resolution + x;
        const worldX = chunkData.minX + x * step;
        const worldZ = chunkData.minZ + z * step;
        const height = heights[index];
        const normal = chunkData.sampleSurfaceNormal(worldX, worldZ, step);
        positions.push(worldX, height, worldZ);
        uvs.push(x / (resolution - 1), z / (resolution - 1));
        normals.push(normal.x, normal.y, normal.z);
        const color = pickVertexColor(
          height,
          slopes[index],
          moisture[index],
          temperature[index],
          biomes[index] as TerrainBiome,
          shoreProximity[index],
          waterDepth[index],
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
    vertexData.colors = colors;
    return vertexData;
  }
}

type Edge = "north" | "south" | "west" | "east";

function appendSkirt(
  positions: number[],
  uvs: number[],
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
    slopes,
    moisture,
    temperature,
    biomes,
    shoreProximity,
    waterDepth
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
    const topNormal = Vector3.FromArray(normals, gridIndex * 3);
    const skirtNormal = createSkirtNormal(topNormal, edge);
    normals.push(skirtNormal.x, skirtNormal.y, skirtNormal.z);

    const color = pickVertexColor(
      height,
      slopes[gridIndex],
      moisture[gridIndex],
      temperature[gridIndex],
      biomes[gridIndex] as TerrainBiome,
      shoreProximity[gridIndex],
      waterDepth[gridIndex],
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
  height: number,
  slope: number,
  moisture: number,
  temperature: number,
  biome: TerrainBiome,
  shoreProximity: number,
  waterDepth: number,
  config: TerrainConfig
): Color4 {
  const normalizedHeight = (height - config.baseHeight) / (config.maxHeight - config.baseHeight);
  const wetness = Math.max(shoreProximity, Math.min(waterDepth / 6, 1));
  const shallowWaterBlend = Math.min(waterDepth / 8, 1);

  switch (biome) {
    case TerrainBiome.Ocean:
      return Color4.Lerp(
        new Color4(0.2, 0.46, 0.58, 1),
        new Color4(0.08, 0.23, 0.35, 1),
        shallowWaterBlend
      );
    case TerrainBiome.Beach:
      return Color4.Lerp(
        new Color4(0.65, 0.57, 0.4, 1),
        new Color4(0.78, 0.74, 0.58, 1),
        moisture * 0.6 + (1 - wetness) * 0.4
      );
    case TerrainBiome.Forest:
      return Color4.Lerp(
        new Color4(0.18, 0.34, 0.16, 1),
        new Color4(0.14, 0.44, 0.2, 1),
        moisture
      );
    case TerrainBiome.Rocky:
      return new Color4(0.42, 0.41, 0.4, 1);
    case TerrainBiome.Alpine:
      return Color4.Lerp(
        new Color4(0.45, 0.47, 0.43, 1),
        new Color4(0.56, 0.58, 0.52, 1),
        normalizedHeight
      );
    case TerrainBiome.Snow:
      return new Color4(0.94, 0.95, 0.96, 1);
    case TerrainBiome.Grassland:
    default:
      if (slope > 0.58) {
        return new Color4(0.42, 0.41, 0.4, 1);
      }

      const inlandGrass = Color4.Lerp(
        new Color4(0.31, 0.44, 0.2, 1),
        new Color4(0.16, 0.5, 0.23, 1),
        moisture * 0.8 + temperature * 0.2
      );
      const coastalGrass = Color4.Lerp(
        new Color4(0.44, 0.46, 0.26, 1),
        new Color4(0.27, 0.4, 0.21, 1),
        moisture
      );
      return Color4.Lerp(inlandGrass, coastalGrass, wetness * 0.75);
  }
}
