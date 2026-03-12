import { Effect } from "@babylonjs/core/Materials/effect";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector2, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder";
import { Scene } from "@babylonjs/core/scene";
import { TerrainConfig } from "./TerrainConfig";
import { ProceduralGenerator } from "./ProceduralGenerator";

const WATER_SHADER_NAME = "terrainWater";
const WATER_SURFACE_OFFSET = 0.02;
const WATER_MASK_RESOLUTION = 512;

export class TerrainWaterSystem {
  private mesh: Mesh | null = null;
  private material: ShaderMaterial | null = null;
  private terrainHeightTexture: RawTexture | null = null;
  private waterLevel: number;

  constructor(
    private readonly scene: Scene,
    private readonly config: TerrainConfig,
    private readonly generator: ProceduralGenerator
  ) {
    this.waterLevel = config.waterLevel;
  }

  initialize(): void {
    if (this.mesh) {
      return;
    }

    registerWaterShaders();
    this.mesh = this.createMesh();
    this.terrainHeightTexture = this.createTerrainHeightTexture();
    this.material = this.createMaterial();
    this.mesh.material = this.material;
    this.updateMeshHeight();
  }

  update(timeSeconds: number, cameraPosition: Vector3): void {
    if (!this.material) {
      return;
    }

    this.material.setFloat("time", timeSeconds);
    this.material.setVector3("cameraPosition", cameraPosition);
  }

  setWaterLevel(level: number): void {
    this.waterLevel = level;
    this.updateMeshHeight();
  }

  getWaterLevel(): number {
    return this.waterLevel;
  }

  dispose(): void {
    this.mesh?.dispose(false, true);
    this.material?.dispose(false, true);
    this.terrainHeightTexture?.dispose();
    this.mesh = null;
    this.material = null;
    this.terrainHeightTexture = null;
  }

  private createMesh(): Mesh {
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

  private createMaterial(): ShaderMaterial {
    const material = new ShaderMaterial(
      "terrain-water-material",
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
          "alpha"
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
    material.setColor3("waterColorDeep", Color3.FromHexString("#1D5D78"));
    material.setColor3("waterColorShallow", Color3.FromHexString("#53A6B8"));
    material.setColor3("edgeTint", Color3.FromHexString("#D6F5FF"));
    material.setFloat("worldMin", this.config.worldMin);
    material.setFloat("worldSize", this.config.worldSize);
    material.setFloat("terrainBaseHeight", this.config.baseHeight);
    material.setFloat("terrainMaxHeight", this.config.maxHeight);
    material.setFloat("shoreFadeDistance", 10);
    material.setVector2("waveScale", new Vector2(0.012, 0.018));
    material.setVector2("waveSpeed", new Vector2(0.04, -0.03));
    material.setFloat("alpha", 0.78);
    if (this.terrainHeightTexture) {
      material.setTexture("terrainHeightMap", this.terrainHeightTexture);
    }

    return material;
  }

  private updateMeshHeight(): void {
    if (!this.mesh) {
      return;
    }

    this.mesh.position.y = this.waterLevel + WATER_SURFACE_OFFSET;
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

      vec3 baseColor = mix(waterColorShallow, waterColorDeep, shallowMix);
      vec3 color = baseColor + edgeTint * (fresnel * 0.55 + shimmer * 0.12);

      gl_FragColor = vec4(color, alpha * max(shoreFade, 0.18));
    }
  `;
}
