import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Engine } from "@babylonjs/core/Engines/engine";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TerrainConfig, TerrainConfigOverrides } from "./terrain/TerrainConfig";
import { TerrainPoi } from "./terrain/TerrainPoiPlanner";
import { TerrainRoad } from "./terrain/TerrainRoadPlanner";
import { TerrainSystem } from "./terrain/TerrainSystem";
import { TerrainFoliageStats } from "./terrain/TerrainFoliageSystem";
import { TerrainPoiDebugConfig, TerrainPoiStats } from "./terrain/TerrainPoiSystem";
import { TerrainRoadStats } from "./terrain/TerrainRoadSystem";
import {
  TerrainDebugViewMode,
  TerrainLayerThresholds,
  TerrainMaterialConfig,
  TerrainTextureOptions
} from "./terrain/materials";
import { TerrainWaterConfig } from "./terrain/TerrainWaterSystem";

export interface TerrainDemo {
  readonly engine: Engine;
  readonly scene: Scene;
  readonly camera: ArcRotateCamera;
  readonly getTerrainSystem: () => TerrainSystem;
  readonly setWireframe: (enabled: boolean) => void;
  readonly toggleDebugOverlay: () => Promise<boolean>;
  readonly setWaterLevel: (level: number) => void;
  readonly getWaterLevel: () => number;
  readonly setWaterConfig: (config: TerrainWaterConfig) => void;
  readonly getWaterConfig: () => TerrainWaterConfig;
  readonly setCollisionRadius: (radius: number) => void;
  readonly getCollisionRadius: () => number;
  readonly setFoliageRadius: (radius: number) => void;
  readonly getFoliageRadius: () => number;
  readonly setShowFoliage: (enabled: boolean) => void;
  readonly getShowFoliage: () => boolean;
  readonly setShowPoi: (enabled: boolean) => void;
  readonly getShowPoi: () => boolean;
  readonly setShowRoads: (enabled: boolean) => void;
  readonly getShowRoads: () => boolean;
  readonly setLodDistances: (distances: readonly [number, number, number]) => void;
  readonly getLodDistances: () => readonly [number, number, number];
  readonly setDebugViewMode: (mode: TerrainDebugViewMode) => void;
  readonly getDebugViewMode: () => TerrainDebugViewMode;
  readonly setTerrainMaterialConfig: (config: TerrainMaterialConfig) => void;
  readonly getTerrainMaterialConfig: () => TerrainMaterialConfig;
  readonly setTerrainMaterialThresholds: (thresholds: TerrainLayerThresholds) => void;
  readonly getTerrainMaterialThresholds: () => TerrainLayerThresholds;
  readonly setUseGeneratedTextures: (enabled: boolean) => void;
  readonly getUseGeneratedTextures: () => boolean;
  readonly rebuildTerrain: (overrides: TerrainConfigOverrides) => void;
  readonly getTerrainConfig: () => TerrainConfig;
  readonly getFoliageStats: () => TerrainFoliageStats;
  readonly getPoiSites: () => readonly TerrainPoi[];
  readonly getPoiStats: () => TerrainPoiStats;
  readonly setPoiDebugConfig: (config: TerrainPoiDebugConfig) => void;
  readonly getPoiDebugConfig: () => TerrainPoiDebugConfig;
  readonly getRoads: () => readonly TerrainRoad[];
  readonly getRoadStats: () => TerrainRoadStats;
}

export function createTerrainDemo(
  canvas: HTMLCanvasElement,
  overrides: TerrainConfigOverrides = {},
  textureOptions: TerrainTextureOptions = {}
): TerrainDemo {
  const engine = new Engine(canvas, true);
  const scene = new Scene(engine);

  const camera = new ArcRotateCamera(
    "terrain-camera",
    -Math.PI / 4,
    Math.PI / 3.2,
    1180,
    new Vector3(0, 32, 0),
    scene
  );
  camera.lowerRadiusLimit = 140;
  camera.upperRadiusLimit = 2000;
  camera.wheelDeltaPercentage = 0.01;
  camera.attachControl(canvas, true);

  const light = new HemisphericLight("terrain-light", new Vector3(0.4, 1, 0.2), scene);
  light.intensity = 0.95;

  let terrainSystem = new TerrainSystem(scene, overrides, textureOptions);
  terrainSystem.initialize();
  terrainSystem.update(camera.position);

  scene.onBeforeRenderObservable.add(() => {
    terrainSystem.update(camera.position);
    terrainSystem.updateDebugOverlay();
  });

  engine.runRenderLoop(() => {
    scene.render();
  });

  window.addEventListener("resize", () => {
    engine.resize();
  });

  return {
    engine,
    scene,
    camera,
    getTerrainSystem: () => terrainSystem,
    setWireframe: (enabled: boolean) => terrainSystem.setWireframe(enabled),
    toggleDebugOverlay: () => terrainSystem.toggleDebugOverlay(),
    setWaterLevel: (level: number) => terrainSystem.setWaterLevel(level),
    getWaterLevel: () => terrainSystem.getWaterLevel(),
    setWaterConfig: (config: TerrainWaterConfig) => terrainSystem.setWaterConfig(config),
    getWaterConfig: () => terrainSystem.getWaterConfig(),
    setCollisionRadius: (radius: number) => terrainSystem.setCollisionRadius(radius),
    getCollisionRadius: () => terrainSystem.getCollisionRadius(),
    setFoliageRadius: (radius: number) => terrainSystem.setFoliageRadius(radius),
    getFoliageRadius: () => terrainSystem.getFoliageRadius(),
    setShowFoliage: (enabled: boolean) => terrainSystem.setShowFoliage(enabled),
    getShowFoliage: () => terrainSystem.getShowFoliage(),
    setShowPoi: (enabled: boolean) => terrainSystem.setShowPoi(enabled),
    getShowPoi: () => terrainSystem.getShowPoi(),
    setShowRoads: (enabled: boolean) => terrainSystem.setShowRoads(enabled),
    getShowRoads: () => terrainSystem.getShowRoads(),
    setLodDistances: (distances: readonly [number, number, number]) =>
      terrainSystem.setLodDistances(distances),
    getLodDistances: () => terrainSystem.getLodDistances(),
    setDebugViewMode: (mode: TerrainDebugViewMode) =>
      terrainSystem.setDebugViewMode(mode),
    getDebugViewMode: () => terrainSystem.getDebugViewMode(),
    setTerrainMaterialConfig: (config: TerrainMaterialConfig) =>
      terrainSystem.setTerrainMaterialConfig(config),
    getTerrainMaterialConfig: () => terrainSystem.getTerrainMaterialConfig(),
    setTerrainMaterialThresholds: (thresholds: TerrainLayerThresholds) =>
      terrainSystem.setTerrainMaterialThresholds(thresholds),
    getTerrainMaterialThresholds: () => terrainSystem.getTerrainMaterialThresholds(),
    setUseGeneratedTextures: (enabled: boolean) => {
      const nextTextureOptions = {
        ...terrainSystem.getTextureOptions(),
        useGeneratedTextures: enabled
      };
      const wireframe = terrainSystem.getWireframe();
      const debugViewMode = terrainSystem.getDebugViewMode();
      const terrainMaterialConfig = terrainSystem.getTerrainMaterialConfig();
      const waterLevel = terrainSystem.getWaterLevel();
      const waterConfig = terrainSystem.getWaterConfig();
      const collisionRadius = terrainSystem.getCollisionRadius();
      const foliageRadius = terrainSystem.getFoliageRadius();
      const showFoliage = terrainSystem.getShowFoliage();
      const showPoi = terrainSystem.getShowPoi();
      const poiDebugConfig = terrainSystem.getPoiDebugConfig();
      const showRoads = terrainSystem.getShowRoads();
      const lodDistances = terrainSystem.getLodDistances();
      const config = terrainSystem.getConfig();
      terrainSystem.dispose();
      terrainSystem = new TerrainSystem(scene, config, nextTextureOptions);
      terrainSystem.initialize();
      terrainSystem.setWireframe(wireframe);
      terrainSystem.setCollisionRadius(collisionRadius);
      terrainSystem.setFoliageRadius(foliageRadius);
      terrainSystem.setShowFoliage(showFoliage);
      terrainSystem.setShowPoi(showPoi);
      terrainSystem.setPoiDebugConfig(poiDebugConfig);
      terrainSystem.setShowRoads(showRoads);
      terrainSystem.setLodDistances(lodDistances);
      terrainSystem.setWaterLevel(waterLevel);
      terrainSystem.setTerrainMaterialConfig(terrainMaterialConfig);
      terrainSystem.setWaterConfig(waterConfig);
      terrainSystem.setDebugViewMode(debugViewMode);
      terrainSystem.update(camera.position);
    },
    getUseGeneratedTextures: () => terrainSystem.getTextureOptions().useGeneratedTextures,
    rebuildTerrain: (nextOverrides: TerrainConfigOverrides) => {
      const wireframe = terrainSystem.getWireframe();
      const debugViewMode = terrainSystem.getDebugViewMode();
      const terrainMaterialConfig = terrainSystem.getTerrainMaterialConfig();
      const waterLevel = terrainSystem.getWaterLevel();
      const waterConfig = terrainSystem.getWaterConfig();
      const collisionRadius = terrainSystem.getCollisionRadius();
      const foliageRadius = terrainSystem.getFoliageRadius();
      const showFoliage = terrainSystem.getShowFoliage();
      const showPoi = terrainSystem.getShowPoi();
      const poiDebugConfig = terrainSystem.getPoiDebugConfig();
      const showRoads = terrainSystem.getShowRoads();
      const lodDistances = terrainSystem.getLodDistances();
      const currentTextureOptions = terrainSystem.getTextureOptions();
      const config = terrainSystem.getConfig();
      const mergedOverrides: TerrainConfigOverrides = {
        ...config,
        ...nextOverrides,
        erosion: {
          ...config.erosion,
          ...nextOverrides.erosion
        },
        features: {
          ...config.features,
          ...nextOverrides.features
        },
        poi: {
          ...config.poi,
          ...nextOverrides.poi
        },
        rivers: {
          ...config.rivers,
          ...nextOverrides.rivers
        },
        shape: {
          ...config.shape,
          ...nextOverrides.shape
        }
      };
      terrainSystem.dispose();
      terrainSystem = new TerrainSystem(scene, mergedOverrides, currentTextureOptions);
      terrainSystem.initialize();
      terrainSystem.setWireframe(wireframe);
      terrainSystem.setCollisionRadius(
        nextOverrides.collisionRadius ?? collisionRadius
      );
      terrainSystem.setFoliageRadius(
        nextOverrides.foliageRadius ?? foliageRadius
      );
      terrainSystem.setShowFoliage(showFoliage);
      terrainSystem.setShowPoi(showPoi);
      terrainSystem.setPoiDebugConfig(poiDebugConfig);
      terrainSystem.setShowRoads(showRoads);
      terrainSystem.setLodDistances(nextOverrides.lodDistances ?? lodDistances);
      terrainSystem.setWaterLevel(nextOverrides.waterLevel ?? waterLevel);
      terrainSystem.setTerrainMaterialConfig(terrainMaterialConfig);
      terrainSystem.setWaterConfig(waterConfig);
      terrainSystem.setDebugViewMode(debugViewMode);
      terrainSystem.update(camera.position);
    },
    getTerrainConfig: () => terrainSystem.getConfig(),
    getFoliageStats: () => terrainSystem.getFoliageStats(),
    getPoiSites: () => terrainSystem.getPoiSites(),
    getPoiStats: () => terrainSystem.getPoiStats(),
    setPoiDebugConfig: (config: TerrainPoiDebugConfig) =>
      terrainSystem.setPoiDebugConfig(config),
    getPoiDebugConfig: () => terrainSystem.getPoiDebugConfig(),
    getRoads: () => terrainSystem.getRoads(),
    getRoadStats: () => terrainSystem.getRoadStats()
  };
}

export * from "./terrain";
