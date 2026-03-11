import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector2, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Effect } from "@babylonjs/core/Materials/effect";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Scene } from "@babylonjs/core/scene";
import { TerrainConfig } from "./TerrainConfig";

export class TerrainWaterSystem {
  private mesh: Mesh | null = null;
  private material: ShaderMaterial | null = null;
  private waterLevel: number;

  constructor(
    private readonly scene: Scene,
    private readonly config: TerrainConfig
  ) {
    this.waterLevel = config.waterLevel;
  }

  initialize(): void {
    if (this.mesh) {
      return;
    }

    ensureWaterShadersRegistered();

    this.mesh = MeshBuilder.CreateGround(
      "terrain-water",
      {
        width: this.config.worldSize,
        height: this.config.worldSize,
        subdivisions: 1
      },
      this.scene
    );
    this.mesh.position.set(0, this.waterLevel, 0);
    this.mesh.isPickable = false;

    this.material = new ShaderMaterial(
      "terrain-water-material",
      this.scene,
      "terrainWater",
      {
        attributes: ["position", "normal", "uv"],
        uniforms: [
          "world",
          "worldViewProjection",
          "time",
          "cameraPosition",
          "deepColor",
          "shallowColor",
          "highlightColor",
          "waveDirection"
        ],
        needAlphaBlending: true
      }
    );
    this.material.backFaceCulling = false;
    this.material.alpha = 0.82;
    this.material.setColor3("deepColor", new Color3(0.08, 0.25, 0.36));
    this.material.setColor3("shallowColor", new Color3(0.16, 0.46, 0.56));
    this.material.setColor3("highlightColor", new Color3(0.73, 0.9, 0.96));
    this.material.setVector2("waveDirection", new Vector2(0.85, 0.35));
    this.material.setFloat("time", 0);
    this.material.setVector3("cameraPosition", Vector3.Zero());
    this.mesh.material = this.material;
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
    if (this.mesh) {
      this.mesh.position.y = level;
    }
  }

  getWaterLevel(): number {
    return this.waterLevel;
  }

  dispose(): void {
    this.mesh?.dispose(false, true);
    this.material?.dispose(false, true);
    this.mesh = null;
    this.material = null;
  }
}

function ensureWaterShadersRegistered(): void {
  if (Effect.ShadersStore.terrainWaterVertexShader) {
    return;
  }

  Effect.ShadersStore.terrainWaterVertexShader = `
    precision highp float;

    attribute vec3 position;
    attribute vec3 normal;
    attribute vec2 uv;

    uniform mat4 world;
    uniform mat4 worldViewProjection;
    uniform float time;
    uniform vec2 waveDirection;

    varying vec3 vWorldPosition;
    varying vec3 vNormalW;
    varying vec2 vUv;

    void main(void) {
      vec3 animatedPosition = position;
      float waveA = sin(dot(position.xz, waveDirection) * 0.035 + time * 1.2) * 0.75;
      float waveB = cos(dot(position.xz, vec2(-waveDirection.y, waveDirection.x)) * 0.05 + time * 0.85) * 0.45;
      animatedPosition.y += waveA + waveB;

      vec4 worldPosition = world * vec4(animatedPosition, 1.0);
      vWorldPosition = worldPosition.xyz;
      vNormalW = normalize(mat3(world) * normal);
      vUv = uv;
      gl_Position = worldViewProjection * vec4(animatedPosition, 1.0);
    }
  `;

  Effect.ShadersStore.terrainWaterFragmentShader = `
    precision highp float;

    uniform vec3 cameraPosition;
    uniform vec3 deepColor;
    uniform vec3 shallowColor;
    uniform vec3 highlightColor;

    varying vec3 vWorldPosition;
    varying vec3 vNormalW;
    varying vec2 vUv;

    void main(void) {
      vec3 viewDir = normalize(cameraPosition - vWorldPosition);
      vec3 normalW = normalize(vNormalW);
      float fresnel = pow(1.0 - max(dot(viewDir, normalW), 0.0), 2.5);
      float foam = 0.5 + 0.5 * sin((vUv.x + vUv.y) * 70.0 + vWorldPosition.x * 0.03 + vWorldPosition.z * 0.02);
      vec3 baseColor = mix(shallowColor, deepColor, 0.55 + vUv.y * 0.15);
      vec3 finalColor = mix(baseColor, highlightColor, fresnel * 0.7 + foam * 0.08);
      gl_FragColor = vec4(finalColor, 0.82);
    }
  `;
}
