import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Engine } from "@babylonjs/core/Engines/engine";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TerrainConfig, TerrainConfigOverrides } from "./terrain/TerrainConfig";
import { TerrainSystem } from "./terrain/TerrainSystem";
import { TerrainFoliageStats } from "./terrain/TerrainFoliageSystem";

export interface TerrainDemo {
  readonly engine: Engine;
  readonly scene: Scene;
  readonly camera: ArcRotateCamera;
  readonly getTerrainSystem: () => TerrainSystem;
  readonly setWireframe: (enabled: boolean) => void;
  readonly toggleDebugOverlay: () => Promise<boolean>;
  readonly setWaterLevel: (level: number) => void;
  readonly getWaterLevel: () => number;
  readonly setCollisionRadius: (radius: number) => void;
  readonly getCollisionRadius: () => number;
  readonly setFoliageRadius: (radius: number) => void;
  readonly getFoliageRadius: () => number;
  readonly setLodDistances: (distances: readonly [number, number, number]) => void;
  readonly getLodDistances: () => readonly [number, number, number];
  readonly rebuildTerrain: (overrides: TerrainConfigOverrides) => void;
  readonly getTerrainConfig: () => TerrainConfig;
  readonly getFoliageStats: () => TerrainFoliageStats;
}

export function createTerrainDemo(
  canvas: HTMLCanvasElement,
  overrides: TerrainConfigOverrides = {}
): TerrainDemo {
  const engine = new Engine(canvas, true);
  const scene = new Scene(engine);

  const camera = new ArcRotateCamera(
    "terrain-camera",
    -Math.PI / 4,
    Math.PI / 3.2,
    900,
    new Vector3(0, 40, 0),
    scene
  );
  camera.lowerRadiusLimit = 140;
  camera.upperRadiusLimit = 1400;
  camera.wheelDeltaPercentage = 0.01;
  camera.attachControl(canvas, true);

  const light = new HemisphericLight("terrain-light", new Vector3(0.4, 1, 0.2), scene);
  light.intensity = 0.95;

  let terrainSystem = new TerrainSystem(scene, overrides);
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
    setCollisionRadius: (radius: number) => terrainSystem.setCollisionRadius(radius),
    getCollisionRadius: () => terrainSystem.getCollisionRadius(),
    setFoliageRadius: (radius: number) => terrainSystem.setFoliageRadius(radius),
    getFoliageRadius: () => terrainSystem.getFoliageRadius(),
    setLodDistances: (distances: readonly [number, number, number]) =>
      terrainSystem.setLodDistances(distances),
    getLodDistances: () => terrainSystem.getLodDistances(),
    rebuildTerrain: (nextOverrides: TerrainConfigOverrides) => {
      const wireframe = terrainSystem.getWireframe();
      const config = terrainSystem.getConfig();
      const mergedOverrides: TerrainConfigOverrides = {
        ...config,
        ...nextOverrides,
        shape: {
          ...config.shape,
          ...nextOverrides.shape
        }
      };
      terrainSystem.dispose();
      terrainSystem = new TerrainSystem(scene, mergedOverrides);
      terrainSystem.initialize();
      terrainSystem.setWireframe(wireframe);
      terrainSystem.update(camera.position);
    },
    getTerrainConfig: () => terrainSystem.getConfig(),
    getFoliageStats: () => terrainSystem.getFoliageStats()
  };
}

export * from "./terrain";
