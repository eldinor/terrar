import { Effect } from "@babylonjs/core/Materials/effect";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector2, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { Scene } from "@babylonjs/core/scene";
import { TerrainConfig } from "./TerrainConfig";
import { ProceduralGenerator } from "./ProceduralGenerator";

const WATER_SHADER_NAME = "terrainWater";
const WATER_SURFACE_OFFSET = 0.02;
const WATER_MASK_RESOLUTION = 512;
export interface TerrainWaterConfig {
  readonly opacity: number;
  readonly shoreFadeDistance: number;
  readonly waveScaleX: number;
  readonly waveScaleZ: number;
  readonly waveSpeedX: number;
  readonly waveSpeedZ: number;
  readonly shallowColor: string;
  readonly deepColor: string;
  readonly riverDischargeStrength: number;
  readonly riverMeshThreshold: number;
  readonly riverMeshMinWidth: number;
  readonly lakeMeshThreshold: number;
  readonly inlandSmoothingPasses: number;
  readonly debugView: number;
}

export const DEFAULT_TERRAIN_WATER_CONFIG: TerrainWaterConfig = Object.freeze({
  opacity: 0.78,
  shoreFadeDistance: 10,
  waveScaleX: 0.012,
  waveScaleZ: 0.018,
  waveSpeedX: 0.04,
  waveSpeedZ: -0.03,
  shallowColor: "#53A6B8",
  deepColor: "#1D5D78",
  riverDischargeStrength: 1,
  riverMeshThreshold: 0.22,
  riverMeshMinWidth: 5,
  lakeMeshThreshold: 0.08,
  inlandSmoothingPasses: 2,
  debugView: 0
});

export class TerrainWaterSystem {
  private oceanMesh: Mesh | null = null;
  private riverMesh: Mesh | null = null;
  private lakeMesh: Mesh | null = null;
  private oceanMaterial: ShaderMaterial | null = null;
  private riverMaterial: ShaderMaterial | null = null;
  private lakeMaterial: ShaderMaterial | null = null;
  private terrainHeightTexture: RawTexture | null = null;
  private waterLevel: number;
  private waterConfig: TerrainWaterConfig = { ...DEFAULT_TERRAIN_WATER_CONFIG };

  constructor(
    private readonly scene: Scene,
    private readonly config: TerrainConfig,
    private readonly generator: ProceduralGenerator
  ) {
    this.waterLevel = config.waterLevel;
  }

  initialize(): void {
    if (this.oceanMesh) {
      return;
    }

    registerWaterShaders();
    this.oceanMesh = this.createOceanMesh();
    this.terrainHeightTexture = this.createTerrainHeightTexture();
    this.oceanMaterial = this.createMaterial("terrain-water-material");
    this.oceanMesh.material = this.oceanMaterial;
    this.rebuildInlandMeshes();
    this.updateMeshHeight();
  }

  update(timeSeconds: number, cameraPosition: Vector3): void {
    [this.oceanMaterial, this.riverMaterial, this.lakeMaterial].forEach((material) => {
      if (!material) {
        return;
      }

      material.setFloat("time", timeSeconds);
      material.setVector3("cameraPosition", cameraPosition);
    });
  }

  setWaterLevel(level: number): void {
    this.waterLevel = level;
    this.updateMeshHeight();
  }

  getWaterLevel(): number {
    return this.waterLevel;
  }

  setConfig(config: TerrainWaterConfig): void {
    const previousConfig = this.waterConfig;
    this.waterConfig = { ...config };
    if (this.oceanMaterial) {
      this.applyConfigToMaterial(this.oceanMaterial, this.waterConfig);
    }
    if (
      previousConfig.riverDischargeStrength !== this.waterConfig.riverDischargeStrength ||
      previousConfig.riverMeshThreshold !== this.waterConfig.riverMeshThreshold ||
      previousConfig.riverMeshMinWidth !== this.waterConfig.riverMeshMinWidth ||
      previousConfig.lakeMeshThreshold !== this.waterConfig.lakeMeshThreshold ||
      previousConfig.inlandSmoothingPasses !== this.waterConfig.inlandSmoothingPasses
    ) {
      this.rebuildInlandMeshes();
    } else {
      if (this.riverMaterial) {
        this.applyConfigToMaterial(this.riverMaterial, this.getRiverConfig());
      }
      if (this.lakeMaterial) {
        this.applyConfigToMaterial(this.lakeMaterial, this.getLakeConfig());
      }
    }
  }

  getConfig(): TerrainWaterConfig {
    return { ...this.waterConfig };
  }

  dispose(): void {
    this.oceanMesh?.dispose(false, true);
    this.riverMesh?.dispose(false, true);
    this.lakeMesh?.dispose(false, true);
    this.oceanMaterial?.dispose(false, true);
    this.riverMaterial?.dispose(false, true);
    this.lakeMaterial?.dispose(false, true);
    this.terrainHeightTexture?.dispose();
    this.oceanMesh = null;
    this.riverMesh = null;
    this.lakeMesh = null;
    this.oceanMaterial = null;
    this.riverMaterial = null;
    this.lakeMaterial = null;
    this.terrainHeightTexture = null;
  }

  private createOceanMesh(): Mesh {
    const mesh = CreateGround(
      "terrain-water",
      {
        width: this.config.worldSize,
        height: this.config.worldSize,
        subdivisions: 96
      },
      this.scene
    );

    mesh.position.set(0, 0, 0);
    mesh.isPickable = false;
    mesh.renderingGroupId = 0;
    return mesh;
  }

  private createInlandMesh(
    inlandGrid: InlandWaterVertex[],
    kind: "river" | "lake"
  ): Mesh | null {
    const resolution = Math.max(17, this.config.rivers.resolution | 0);
    const positions: number[] = [];
    const indices: number[] = [];
    const uvs: number[] = [];
    let vertexOffset = 0;

    for (let z = 0; z < resolution - 1; z += 1) {
      for (let x = 0; x < resolution - 1; x += 1) {
        const corners = [
          inlandGrid[this.toGridIndex(x, z, resolution)],
          inlandGrid[this.toGridIndex(x + 1, z, resolution)],
          inlandGrid[this.toGridIndex(x + 1, z + 1, resolution)],
          inlandGrid[this.toGridIndex(x, z + 1, resolution)]
        ] as const;
        const maxRiverMeshSignal = Math.max(
          corners[0].riverMeshSignal,
          corners[1].riverMeshSignal,
          corners[2].riverMeshSignal,
          corners[3].riverMeshSignal
        );
        const maxRiverWidth = Math.max(
          corners[0].riverWidth,
          corners[1].riverWidth,
          corners[2].riverWidth,
          corners[3].riverWidth
        );
        const maxInlandWater = Math.max(
          Math.max(corners[0].river, corners[0].lake),
          Math.max(corners[1].river, corners[1].lake),
          Math.max(corners[2].river, corners[2].lake),
          Math.max(corners[3].river, corners[3].lake)
        );
        const maxLakeSignal = Math.max(corners[0].lake, corners[1].lake, corners[2].lake, corners[3].lake);

        if (
          kind === "river" &&
          (
            maxRiverMeshSignal <= this.waterConfig.riverMeshThreshold ||
            maxRiverWidth < this.waterConfig.riverMeshMinWidth
          )
        ) {
          continue;
        }

        if (kind === "lake" && maxLakeSignal <= this.waterConfig.lakeMeshThreshold) {
          continue;
        }

        if (
          maxInlandWater <= this.waterConfig.lakeMeshThreshold &&
          maxRiverMeshSignal <= this.waterConfig.riverMeshThreshold
        ) {
          continue;
        }

        const polygon =
          kind === "lake"
            ? clipInlandPolygon(
                corners,
                this.waterConfig.lakeMeshThreshold,
                (vertex) => vertex.lake
              )
            : corners.slice();

        if (polygon.length < 3) {
          continue;
        }

        polygon.forEach((corner) => {
          positions.push(corner.x, corner.y, corner.z);
          uvs.push(corner.u, corner.v);
        });

        for (let triangle = 1; triangle < polygon.length - 1; triangle += 1) {
          indices.push(
            vertexOffset,
            vertexOffset + triangle + 1,
            vertexOffset + triangle
          );
        }
        vertexOffset += polygon.length;
      }
    }

    if (positions.length === 0) {
      return null;
    }

    const normals = new Array<number>(positions.length).fill(0);
    VertexData.ComputeNormals(positions, indices, normals);

    const mesh = new Mesh(kind === "river" ? "terrain-rivers" : "terrain-lakes", this.scene);
    const vertexData = new VertexData();
    vertexData.positions = positions;
    vertexData.indices = indices;
    vertexData.normals = normals;
    vertexData.uvs = uvs;
    vertexData.applyToMesh(mesh, true);
    mesh.isPickable = false;
    mesh.renderingGroupId = 0;
    mesh.freezeWorldMatrix();
    return mesh;
  }

  private createInlandWaterGrid(
    resolution: number,
    step: number
  ): InlandWaterVertex[] {
    const vertices = new Array<InlandWaterVertex>(resolution * resolution);

    for (let gridZ = 0; gridZ < resolution; gridZ += 1) {
      for (let gridX = 0; gridX < resolution; gridX += 1) {
        vertices[this.toGridIndex(gridX, gridZ, resolution)] = this.sampleRiverCorner(
          gridX,
          gridZ,
          step,
          resolution
        );
      }
    }

    smoothInlandWaterGrid(
      vertices,
      resolution,
      Math.max(0, Math.round(this.waterConfig.inlandSmoothingPasses))
    );
    return vertices;
  }

  private sampleRiverCorner(
    gridX: number,
    gridZ: number,
    step: number,
    resolution: number
  ): InlandWaterVertex {
    const x = this.config.worldMin + gridX * step;
    const z = this.config.worldMin + gridZ * step;
    const sample = this.generator.sample(x, z);
    const isLake = sample.lake >= this.waterConfig.lakeMeshThreshold;
    const discharge = smoothStep(this.config.rivers.flowThreshold, 1, sample.flow);
    const dischargeStrength = this.waterConfig.riverDischargeStrength;
    const riverMeshSignal = sample.river * (0.72 + discharge * 0.85 * dischargeStrength);
    const riverWidth = estimateRiverWidth(
      sample.river,
      discharge,
      this.config.rivers.bankStrength,
      dischargeStrength
    );
    const lift =
      WATER_SURFACE_OFFSET +
      0.08 +
      sample.river * 0.28 +
      discharge * 0.22 * dischargeStrength;
    return {
      x,
      y: isLake ? sample.lakeSurfaceHeight + WATER_SURFACE_OFFSET : sample.height + lift,
      z,
      river: sample.river,
      lake: sample.lake,
      riverMeshSignal,
      riverWidth,
      u: gridX / Math.max(1, resolution - 1),
      v: gridZ / Math.max(1, resolution - 1)
    };
  }

  private rebuildInlandMeshes(): void {
    this.disposeInlandMeshes();

    if (!this.config.rivers.enabled) {
      return;
    }

    const inlandResolution = Math.max(17, this.config.rivers.resolution | 0);
    const inlandGrid = this.createInlandWaterGrid(
      inlandResolution,
      this.config.worldSize / (inlandResolution - 1)
    );
    this.riverMesh = this.createInlandMesh(inlandGrid, "river");
    this.lakeMesh = this.createInlandMesh(inlandGrid, "lake");

    if (this.riverMesh) {
      this.riverMaterial = this.createMaterial("terrain-river-material", this.getRiverConfig());
      this.riverMesh.material = this.riverMaterial;
    }

    if (this.lakeMesh) {
      this.lakeMaterial = this.createMaterial("terrain-lake-material", this.getLakeConfig());
      this.lakeMesh.material = this.lakeMaterial;
    }
  }

  private disposeInlandMeshes(): void {
    this.riverMesh?.dispose(false, true);
    this.lakeMesh?.dispose(false, true);
    this.riverMaterial?.dispose(false, true);
    this.lakeMaterial?.dispose(false, true);
    this.riverMesh = null;
    this.lakeMesh = null;
    this.riverMaterial = null;
    this.lakeMaterial = null;
  }

  private getRiverConfig(): TerrainWaterConfig {
    return {
      ...this.waterConfig,
      opacity: Math.min(0.96, this.waterConfig.opacity + 0.1),
      shoreFadeDistance: Math.min(6, this.waterConfig.shoreFadeDistance),
      waveScaleX: this.waterConfig.waveScaleX * 2.1,
      waveScaleZ: this.waterConfig.waveScaleZ * 2.1,
      waveSpeedX: this.waterConfig.waveSpeedX * 1.35,
      waveSpeedZ: this.waterConfig.waveSpeedZ * 1.35,
      shallowColor: "#4E9BB0",
      deepColor: "#1A5570"
    };
  }

  private getLakeConfig(): TerrainWaterConfig {
    return {
      ...this.waterConfig,
      opacity: Math.min(0.9, this.waterConfig.opacity + 0.04),
      shoreFadeDistance: Math.max(8, this.waterConfig.shoreFadeDistance),
      waveScaleX: this.waterConfig.waveScaleX * 0.75,
      waveScaleZ: this.waterConfig.waveScaleZ * 0.75,
      waveSpeedX: this.waterConfig.waveSpeedX * 0.5,
      waveSpeedZ: this.waterConfig.waveSpeedZ * 0.5,
      shallowColor: "#6AAFC1",
      deepColor: "#255C76"
    };
  }

  private toGridIndex(x: number, z: number, resolution: number): number {
    return z * resolution + x;
  }

  private createMaterial(
    name: string,
    overrides: Partial<TerrainWaterConfig> = {}
  ): ShaderMaterial {
    const runtimeConfig = {
      ...this.waterConfig,
      ...overrides
    };
    const material = new ShaderMaterial(
      name,
      this.scene,
      WATER_SHADER_NAME,
      {
        attributes: ["position", "uv"],
        uniforms: [
          "world",
          "worldView",
          "worldViewProjection",
          "view",
          "projection",
          "time",
          "cameraPosition",
          "waterColorDeep",
          "waterColorShallow",
          "edgeTint",
          "worldMin",
          "worldSize",
          "terrainBaseHeight",
          "terrainMaxHeight",
          "shoreFadeDistance",
          "waveScale",
          "waveSpeed",
          "alpha",
          "debugView"
        ],
        samplers: ["terrainHeightMap"],
        needAlphaBlending: true
      }
    );

    material.backFaceCulling = false;
    material.alphaMode = 2;
    material.needDepthPrePass = true;
    material.forceDepthWrite = true;

    material.setFloat("time", 0);
    material.setVector3("cameraPosition", Vector3.Zero());
    material.setColor3("edgeTint", Color3.FromHexString("#D6F5FF"));
    material.setFloat("worldMin", this.config.worldMin);
    material.setFloat("worldSize", this.config.worldSize);
    material.setFloat("terrainBaseHeight", this.config.baseHeight);
    material.setFloat("terrainMaxHeight", this.config.maxHeight);
    this.applyConfigToMaterial(material, runtimeConfig);
    if (this.terrainHeightTexture) {
      material.setTexture("terrainHeightMap", this.terrainHeightTexture);
    }

    return material;
  }

  private updateMeshHeight(): void {
    if (!this.oceanMesh) {
      return;
    }

    this.oceanMesh.position.y = this.waterLevel + WATER_SURFACE_OFFSET;
  }

  private createTerrainHeightTexture(): RawTexture {
    const size = WATER_MASK_RESOLUTION;
    const data = new Uint8Array(size * size);
    const heightRange = Math.max(this.config.maxHeight - this.config.baseHeight, 1);

    for (let z = 0; z < size; z += 1) {
      for (let x = 0; x < size; x += 1) {
        const u = x / (size - 1);
        const v = z / (size - 1);
        const worldX = this.config.worldMin + u * this.config.worldSize;
        const worldZ = this.config.worldMin + v * this.config.worldSize;
        const height = this.generator.sample(worldX, worldZ).height;
        const normalizedHeight = (height - this.config.baseHeight) / heightRange;
        data[z * size + x] = Math.round(Math.max(0, Math.min(1, normalizedHeight)) * 255);
      }
    }

    const texture = RawTexture.CreateLuminanceTexture(
      data,
      size,
      size,
      this.scene,
      false,
      false,
      Texture.TRILINEAR_SAMPLINGMODE
    );
    texture.wrapU = Texture.CLAMP_ADDRESSMODE;
    texture.wrapV = Texture.CLAMP_ADDRESSMODE;
    return texture;
  }

  private applyConfigToMaterial(
    material: ShaderMaterial,
    config: TerrainWaterConfig
  ): void {
    material.setFloat("shoreFadeDistance", config.shoreFadeDistance);
    material.setColor3("waterColorShallow", Color3.FromHexString(config.shallowColor));
    material.setColor3("waterColorDeep", Color3.FromHexString(config.deepColor));
    material.setVector2(
      "waveScale",
      new Vector2(config.waveScaleX, config.waveScaleZ)
    );
    material.setVector2(
      "waveSpeed",
      new Vector2(config.waveSpeedX, config.waveSpeedZ)
    );
    material.setFloat("alpha", config.opacity);
    material.setInt("debugView", config.debugView);
  }
}

interface InlandWaterVertex {
  x: number;
  y: number;
  z: number;
  river: number;
  lake: number;
  riverMeshSignal: number;
  riverWidth: number;
  u: number;
  v: number;
}

function clipInlandPolygon(
  corners: readonly InlandWaterVertex[],
  threshold: number,
  signal: (vertex: InlandWaterVertex) => number
): InlandWaterVertex[] {
  const polygon: InlandWaterVertex[] = [];

  for (let index = 0; index < corners.length; index += 1) {
    const current = corners[index];
    const previous = corners[(index + corners.length - 1) % corners.length];
    const currentInside = isInsideThreshold(current, threshold, signal);
    const previousInside = isInsideThreshold(previous, threshold, signal);

    if (currentInside) {
      if (!previousInside) {
        polygon.push(interpolateThresholdVertex(previous, current, threshold, signal));
      }
      polygon.push(current);
    } else if (previousInside) {
      polygon.push(interpolateThresholdVertex(previous, current, threshold, signal));
    }
  }

  return polygon;
}

function isInsideThreshold(
  vertex: InlandWaterVertex,
  threshold: number,
  signal: (vertex: InlandWaterVertex) => number
): boolean {
  return signal(vertex) >= threshold;
}

function interpolateThresholdVertex(
  start: InlandWaterVertex,
  end: InlandWaterVertex,
  threshold: number,
  signal: (vertex: InlandWaterVertex) => number
): InlandWaterVertex {
  const startValue = signal(start);
  const endValue = signal(end);
  const denominator = endValue - startValue;
  const t =
    Math.abs(denominator) < 0.0001
      ? 0.5
      : Math.max(0, Math.min(1, (threshold - startValue) / denominator));

  return {
    x: lerp(start.x, end.x, t),
    y: lerp(start.y, end.y, t),
    z: lerp(start.z, end.z, t),
    river: lerp(start.river, end.river, t),
    lake: lerp(start.lake, end.lake, t),
    riverMeshSignal: lerp(start.riverMeshSignal, end.riverMeshSignal, t),
    riverWidth: lerp(start.riverWidth, end.riverWidth, t),
    u: lerp(start.u, end.u, t),
    v: lerp(start.v, end.v, t)
  };
}

function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

function smoothInlandWaterGrid(
  vertices: InlandWaterVertex[],
  resolution: number,
  passes: number
): void {
  const offsets: readonly [number, number][] = [
    [0, 0],
    [0, -1],
    [-1, 0],
    [1, 0],
    [0, 1],
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1]
  ];

  for (let pass = 0; pass < passes; pass += 1) {
    const nextHeights = new Float32Array(vertices.length);
    const nextRiver = new Float32Array(vertices.length);
    const nextLake = new Float32Array(vertices.length);
    const nextRiverMeshSignal = new Float32Array(vertices.length);
    const nextRiverWidth = new Float32Array(vertices.length);

    for (let z = 0; z < resolution; z += 1) {
      for (let x = 0; x < resolution; x += 1) {
        const index = z * resolution + x;
        let totalWeight = 0;
        let totalHeight = 0;
        let totalRiver = 0;
        let totalLake = 0;
        let totalRiverMeshSignal = 0;
        let totalRiverWidth = 0;

        offsets.forEach(([offsetX, offsetZ]) => {
          const nx = x + offsetX;
          const nz = z + offsetZ;
          if (nx < 0 || nz < 0 || nx >= resolution || nz >= resolution) {
            return;
          }

          const neighbor = vertices[nz * resolution + nx];
          const weight = offsetX === 0 && offsetZ === 0 ? 0.28 : 0.09;
          totalWeight += weight;
          totalHeight += neighbor.y * weight;
          totalRiver += neighbor.river * weight;
          totalLake += neighbor.lake * weight;
          totalRiverMeshSignal += neighbor.riverMeshSignal * weight;
          totalRiverWidth += neighbor.riverWidth * weight;
        });

        nextHeights[index] = totalHeight / Math.max(totalWeight, 0.0001);
        nextRiver[index] = totalRiver / Math.max(totalWeight, 0.0001);
        nextLake[index] = totalLake / Math.max(totalWeight, 0.0001);
        nextRiverMeshSignal[index] =
          totalRiverMeshSignal / Math.max(totalWeight, 0.0001);
        nextRiverWidth[index] = totalRiverWidth / Math.max(totalWeight, 0.0001);
      }
    }

    for (let index = 0; index < vertices.length; index += 1) {
      vertices[index].y = nextHeights[index];
      vertices[index].river = nextRiver[index];
      vertices[index].lake = nextLake[index];
      vertices[index].riverMeshSignal = nextRiverMeshSignal[index];
      vertices[index].riverWidth = nextRiverWidth[index];
    }
  }
}

function estimateRiverWidth(
  river: number,
  discharge: number,
  bankStrength: number,
  dischargeStrength: number
): number {
  const signal = Math.max(river, discharge * 0.9);
  const widthFactor = Math.max(0.15, bankStrength) * 0.8 + dischargeStrength * 0.35;
  return 1.5 + signal * 10.5 * widthFactor;
}

function registerWaterShaders(): void {
  if (Effect.ShadersStore[`${WATER_SHADER_NAME}VertexShader`]) {
    return;
  }

  Effect.ShadersStore[`${WATER_SHADER_NAME}VertexShader`] = `
    precision highp float;

    attribute vec3 position;
    attribute vec2 uv;

    uniform mat4 world;
    uniform mat4 worldViewProjection;

    varying vec3 vWorldPosition;
    varying vec2 vUv;

    void main(void) {
      vec4 worldPosition = world * vec4(position, 1.0);
      vWorldPosition = worldPosition.xyz;
      vUv = uv;
      gl_Position = worldViewProjection * vec4(position, 1.0);
    }
  `;

  Effect.ShadersStore[`${WATER_SHADER_NAME}FragmentShader`] = `
    precision highp float;

    varying vec3 vWorldPosition;
    varying vec2 vUv;

    uniform float time;
    uniform vec3 cameraPosition;
    uniform vec3 waterColorDeep;
    uniform vec3 waterColorShallow;
    uniform vec3 edgeTint;
    uniform sampler2D terrainHeightMap;
    uniform float worldMin;
    uniform float worldSize;
    uniform float terrainBaseHeight;
    uniform float terrainMaxHeight;
    uniform float shoreFadeDistance;
    uniform vec2 waveScale;
    uniform vec2 waveSpeed;
    uniform float alpha;
    uniform int debugView;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
    }

    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);

      return mix(
        mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
        mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
        u.y
      );
    }

    float saturate(float value) {
      return clamp(value, 0.0, 1.0);
    }

    void main(void) {
      vec2 terrainUv = (vWorldPosition.xz - vec2(worldMin)) / worldSize;
      float terrainHeightSample = texture2D(terrainHeightMap, terrainUv).r;
      float terrainHeight = mix(terrainBaseHeight, terrainMaxHeight, terrainHeightSample);
      float waterDepth = vWorldPosition.y - terrainHeight;

      if (waterDepth <= 0.0) {
        discard;
      }

      vec2 flowUvA = vWorldPosition.xz * waveScale + waveSpeed * time;
      vec2 flowUvB = vWorldPosition.zx * (waveScale * 1.7) - waveSpeed.yx * time * 1.35;

      float waveA = noise(flowUvA);
      float waveB = noise(flowUvB);
      float wave = waveA * 0.6 + waveB * 0.4;

      vec3 normal = normalize(vec3(
        (waveA - 0.5) * 0.35 + (waveB - 0.5) * 0.2,
        1.0,
        (waveB - 0.5) * 0.35 - (waveA - 0.5) * 0.2
      ));

      vec3 viewDir = normalize(cameraPosition - vWorldPosition);
      float fresnel = pow(1.0 - max(dot(viewDir, normal), 0.0), 3.2);
      float shimmer = smoothstep(0.72, 0.98, wave);
      float shallowMix = smoothstep(0.0, 18.0, waterDepth);
      float shoreFade = smoothstep(0.0, shoreFadeDistance, waterDepth);

      if (debugView == 1) {
        gl_FragColor = vec4(vec3(terrainHeightSample), 1.0);
        return;
      }

      if (debugView == 2) {
        gl_FragColor = vec4(vec3(saturate(waterDepth / max(shoreFadeDistance, 0.001))), 1.0);
        return;
      }

      if (debugView == 3) {
        gl_FragColor = vec4(vec3(shoreFade), 1.0);
        return;
      }

      vec3 baseColor = mix(waterColorShallow, waterColorDeep, shallowMix);
      vec3 color = baseColor + edgeTint * (fresnel * 0.55 + shimmer * 0.12);

      gl_FragColor = vec4(color, alpha * max(shoreFade, 0.18));
    }
  `;
}

function smoothStep(min: number, max: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - min) / Math.max(max - min, 0.0001)));
  return t * t * (3 - 2 * t);
}
