import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Scene } from "@babylonjs/core/scene";
import { ProceduralGenerator } from "./ProceduralGenerator";
import { TerrainConfig } from "./TerrainConfig";
import { TerrainMeshBuilder } from "./TerrainMeshBuilder";
import { TerrainWaterConfig, TerrainWaterSystem } from "./TerrainWaterSystem";
import {
  cloneTerrainMaterialConfig,
  TerrainDebugViewMode,
  TerrainLayerThresholds,
  TerrainMaterialConfig,
  TerrainMaterialFactory,
  TerrainTextureOptions
} from "./materials";

export class TerrainSurfaceRuntime {
  private readonly waterSystem: TerrainWaterSystem;
  private material: ShaderMaterial | null = null;
  private materialConfig: TerrainMaterialConfig | null = null;
  private debugViewMode = TerrainDebugViewMode.Final;

  constructor(
    private readonly scene: Scene,
    private readonly config: TerrainConfig,
    generator: ProceduralGenerator,
    private readonly textureOptions: Required<TerrainTextureOptions>
  ) {
    this.waterSystem = new TerrainWaterSystem(this.scene, this.config, generator);
  }

  initialize(roadMaskTexture: Texture | null): ShaderMaterial {
    if (this.material) {
      return this.material;
    }

    this.material = TerrainMeshBuilder.createSharedMaterial(
      this.scene,
      this.config,
      this.textureOptions
    );
    this.materialConfig = TerrainMaterialFactory.getConfig(this.material);
    TerrainMaterialFactory.setWaterLevel(this.material, this.config.waterLevel);
    TerrainMaterialFactory.setRiverRenderingParams(this.material, {
      bankStrength: this.config.rivers.bankStrength,
      dischargeStrength: this.waterSystem.getConfig().riverDischargeStrength,
      meshThreshold: this.waterSystem.getConfig().riverMeshThreshold,
      meshMinWidth: this.waterSystem.getConfig().riverMeshMinWidth
    });

    if (roadMaskTexture) {
      TerrainMaterialFactory.setRoadMask(this.material, roadMaskTexture);
      TerrainMaterialFactory.setRoadMaskBounds(
        this.material,
        { x: this.config.worldMin, z: this.config.worldMin },
        { x: this.config.worldSize, z: this.config.worldSize }
      );
    }

    this.waterSystem.initialize();
    return this.material;
  }

  update(timeSeconds: number, cameraPosition: Vector3): void {
    this.waterSystem.update(timeSeconds, cameraPosition);
  }

  dispose(): void {
    this.waterSystem.dispose();
    this.material?.dispose(false, true);
    this.material = null;
    this.materialConfig = null;
    this.debugViewMode = TerrainDebugViewMode.Final;
  }

  getMaterial(): ShaderMaterial {
    if (!this.material) {
      throw new Error("TerrainSurfaceRuntime.initialize() must be called before getMaterial().");
    }
    return this.material;
  }

  setWireframe(enabled: boolean): void {
    const material = this.getMaterial();
    material.unfreeze();
    material.wireframe = enabled;
    material.freeze();
  }

  getWireframe(): boolean {
    return this.material?.wireframe ?? false;
  }

  setWaterLevel(level: number): void {
    this.waterSystem.setWaterLevel(level);
    if (this.material) {
      TerrainMaterialFactory.setWaterLevel(this.material, level);
    }
  }

  getWaterLevel(): number {
    return this.waterSystem.getWaterLevel();
  }

  setWaterConfig(config: TerrainWaterConfig): void {
    this.waterSystem.setConfig(config);
    if (this.material) {
      TerrainMaterialFactory.setRiverRenderingParams(this.material, {
        bankStrength: this.config.rivers.bankStrength,
        dischargeStrength: config.riverDischargeStrength,
        meshThreshold: config.riverMeshThreshold,
        meshMinWidth: config.riverMeshMinWidth
      });
    }
  }

  getWaterConfig(): TerrainWaterConfig {
    return this.waterSystem.getConfig();
  }

  setDebugViewMode(mode: TerrainDebugViewMode): void {
    const material = this.getMaterial();
    TerrainMaterialFactory.setDebugMode(material, mode);
    if (this.materialConfig) {
      this.materialConfig.debugMode = mode;
    }
    this.debugViewMode = mode;
  }

  getDebugViewMode(): TerrainDebugViewMode {
    return this.debugViewMode;
  }

  setTerrainMaterialConfig(config: TerrainMaterialConfig): void {
    const material = this.getMaterial();
    TerrainMaterialFactory.applyConfig(material, config);
    this.materialConfig = cloneTerrainMaterialConfig(config);
    this.debugViewMode = config.debugMode as TerrainDebugViewMode;
  }

  getTerrainMaterialConfig(): TerrainMaterialConfig {
    return cloneTerrainMaterialConfig(
      this.materialConfig ?? TerrainMaterialFactory.getConfig(this.getMaterial())!
    );
  }

  setTerrainMaterialThresholds(thresholds: TerrainLayerThresholds): void {
    const nextConfig = this.getTerrainMaterialConfig();
    nextConfig.thresholds = { ...thresholds };
    this.setTerrainMaterialConfig(nextConfig);
  }

  getTerrainMaterialThresholds(): TerrainLayerThresholds {
    return { ...this.getTerrainMaterialConfig().thresholds };
  }
}
