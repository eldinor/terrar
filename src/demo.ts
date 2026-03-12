import type {
  TerrainConfigOverrides,
  TerrainErosionConfig,
  TerrainFeatureConfig,
  TerrainPoiConfig,
  TerrainRiverConfig,
  TerrainShapeConfig
} from "./terrain/TerrainConfig";
import type { TerrainPoiKind } from "./terrain/TerrainPoiPlanner";
import type { TerrainPoiDebugConfig } from "./terrain/TerrainPoiSystem";
import type { TerrainWaterConfig } from "./terrain/TerrainWaterSystem";
import {
  TerrainDebugViewMode,
  TerrainLayerThresholds
} from "./terrain/materials";
import { createTerrainDemo } from "./main";

interface TerrainPreset {
  readonly name: string;
  readonly config: TerrainConfigOverrides;
  readonly featureState?: PresetFeatureState;
}

interface PresetFeatureState {
  readonly poiDebug: TerrainPoiDebugConfig;
}

const BUILTIN_PRESETS: readonly TerrainPreset[] = [
  {
    name: "Default",
    config: {}
  },
  {
    name: "Archipelago",
    config: {
      waterLevel: 8,
      baseHeight: -34,
      maxHeight: 200,
      shape: {
        continentAmplitude: 56,
        radialFalloffStrength: 0.86,
        mountainAmplitude: 88,
        hillAmplitude: 34,
        detailAmplitude: 5
      }
    }
  },
  {
    name: "Highlands",
    config: {
      waterLevel: -6,
      baseHeight: -18,
      maxHeight: 250,
      shape: {
        continentAmplitude: 86,
        radialFalloffStrength: 0.48,
        mountainAmplitude: 154,
        hillAmplitude: 54,
        detailAmplitude: 10
      }
    }
  },
  {
    name: "Basin",
    config: {
      waterLevel: 12,
      baseHeight: -42,
      maxHeight: 168,
      shape: {
        continentAmplitude: 64,
        radialFalloffStrength: 0.92,
        mountainAmplitude: 76,
        hillAmplitude: 24,
        detailAmplitude: 4
      }
    }
  }
] as const;

const SAVED_PRESETS_KEY = "terrar.saved-presets";

const mount = document.getElementById("app");

if (!mount) {
  throw new Error("Missing #app mount element.");
}

const canvas = document.createElement("canvas");
canvas.id = "terrain-canvas";
mount.appendChild(canvas);

const demo = createTerrainDemo(canvas);
type PanelTab = "runtime" | "material" | "world" | "presets";
let buildStatus = demo.getBuildStatus();
let featureBuildStatusText: HTMLDivElement | null = null;
const workerStatus = demo.getWorkerStatus();

const hud = document.createElement("div");
hud.style.position = "fixed";
hud.style.top = "16px";
hud.style.left = "16px";
hud.style.padding = "10px 12px";
hud.style.border = "1px solid rgba(255, 255, 255, 0.18)";
hud.style.borderRadius = "10px";
hud.style.background = "rgba(6, 10, 15, 0.72)";
hud.style.color = "#f4edc9";
hud.style.font = "12px/1.45 Consolas, 'Courier New', monospace";
hud.style.zIndex = "10";
hud.style.userSelect = "none";
document.body.appendChild(hud);

const panel = document.createElement("div");
panel.style.position = "fixed";
panel.style.top = "72px";
panel.style.left = "16px";
panel.style.width = "320px";
panel.style.maxHeight = "calc(100vh - 88px)";
panel.style.overflowY = "auto";
panel.style.overflowX = "hidden";
panel.style.padding = "12px";
panel.style.border = "1px solid rgba(255, 255, 255, 0.18)";
panel.style.borderRadius = "12px";
panel.style.background = "rgba(6, 10, 15, 0.78)";
panel.style.color = "#f4edc9";
panel.style.font = "12px/1.45 Consolas, 'Courier New', monospace";
panel.style.zIndex = "10";
panel.style.userSelect = "none";
panel.style.backdropFilter = "blur(8px)";
panel.style.boxSizing = "border-box";
document.body.appendChild(panel);

const featurePanel = document.createElement("div");
featurePanel.style.position = "fixed";
featurePanel.style.top = "72px";
featurePanel.style.right = "16px";
featurePanel.style.width = "280px";
featurePanel.style.maxHeight = "calc(100vh - 88px)";
featurePanel.style.overflowY = "auto";
featurePanel.style.overflowX = "hidden";
featurePanel.style.padding = "12px";
featurePanel.style.border = "1px solid rgba(255, 255, 255, 0.18)";
featurePanel.style.borderRadius = "12px";
featurePanel.style.background = "rgba(6, 10, 15, 0.78)";
featurePanel.style.color = "#f4edc9";
featurePanel.style.font = "12px/1.45 Consolas, 'Courier New', monospace";
featurePanel.style.zIndex = "10";
featurePanel.style.userSelect = "none";
featurePanel.style.backdropFilter = "blur(8px)";
featurePanel.style.boxSizing = "border-box";
document.body.appendChild(featurePanel);

let wireframe = false;
let debugVisible = false;
let loadingDebug = false;
let draftConfig = buildDraftConfig();
let presetOptions = getPresetOptions();
let activeTab: PanelTab = "runtime";

function renderHud(): void {
  const debugState = loadingDebug ? "loading" : debugVisible ? "on" : "off";
  const foliage = demo.getFoliageStats();
  const poi = demo.getPoiStats();
  const roads = demo.getRoadStats();
  const workerText = workerStatus.sharedSnapshotsEnabled
    ? "sab:on"
    : workerStatus.workersEnabled
      ? "sab:off"
      : "workers:off";
  const buildText = buildStatus.phase === "idle" ? "" : ` | build: ${buildStatus.message}`;
  hud.textContent =
    `G debug: ${debugState} | V wireframe: ${wireframe ? "on" : "off"} | ` +
    `foliage: ${foliage.visibleInstances}/${foliage.totalInstances} ` +
    `(T ${foliage.visibleTrees}/${foliage.totalTrees}, ` +
    `B ${foliage.visibleBushes}/${foliage.totalBushes}, ` +
    `R ${foliage.visibleRocks}/${foliage.totalRocks}) | ` +
    `poi: ${poi.total} | roads: ${roads.totalRoads} | ${workerText}${buildText}`;
}

renderHud();
renderPanel();
renderFeaturePanel();
demo.subscribeBuildStatus((status) => {
  buildStatus = status;
  renderHud();
  updateFeatureBuildStatus();
});

window.addEventListener("keydown", async (event) => {
  if (event.repeat) {
    return;
  }

  if (event.key.toLowerCase() === "g") {
    if (loadingDebug) {
      return;
    }

    loadingDebug = true;
    renderHud();
    debugVisible = await demo.toggleDebugOverlay();
    loadingDebug = false;
    renderHud();
  }

  if (event.key.toLowerCase() === "v") {
    wireframe = !wireframe;
    demo.setWireframe(wireframe);
    renderHud();
  }
});

function renderPanel(): void {
  panel.replaceChildren();

  panel.appendChild(createHeading("Terrain Tuning"));
  panel.appendChild(createTabBar());

  if (activeTab === "runtime") {
    renderRuntimeTab();
  } else if (activeTab === "material") {
    renderMaterialTab();
  } else if (activeTab === "world") {
    renderWorldTab();
  } else {
    renderPresetsTab();
  }

  renderFeaturePanel();
}

function renderFeaturePanel(): void {
  featurePanel.replaceChildren();
  featurePanel.appendChild(createHeading("World Features"));
  featurePanel.appendChild(createSectionLabel("Build"));
  featurePanel.appendChild(
    createCheckbox("POI", draftConfig.features.poi, (checked) => {
      draftConfig.features.poi = checked;
      if (!checked) {
        draftConfig.features.roads = false;
      }
      renderFeaturePanel();
    })
  );
  featurePanel.appendChild(
    createCheckbox("Build Roads", draftConfig.features.roads, (checked) => {
      draftConfig.features.roads = checked && draftConfig.features.poi;
    }, !draftConfig.features.poi)
  );
  featurePanel.appendChild(createFeatureBuildStatus());
  featurePanel.appendChild(
    createButton("Apply Features", () => {
      return applyDraftToWorld();
    })
  );

  if (draftConfig.features.poi) {
    featurePanel.appendChild(createDivider());
    featurePanel.appendChild(createSectionLabel("POI Debug"));
    featurePanel.appendChild(createPoiDebugControls());
    featurePanel.appendChild(createPoiStatsRow());
  }
}

function renderRuntimeTab(): void {
  panel.appendChild(createSectionLabel("Runtime"));
  panel.appendChild(
    createSlider("Water", -24, 32, 1, draftConfig.waterLevel, (value) => {
      draftConfig.waterLevel = value;
      demo.setWaterLevel(value);
    })
  );
  panel.appendChild(
    createSlider("Water Opacity", 0.1, 1, 0.01, draftConfig.water.opacity, (value) => {
      draftConfig.water.opacity = value;
      applyDraftWaterConfig();
    })
  );
  panel.appendChild(
    createSlider("Shore Fade", 1, 32, 0.5, draftConfig.water.shoreFadeDistance, (value) => {
      draftConfig.water.shoreFadeDistance = value;
      applyDraftWaterConfig();
    })
  );
  panel.appendChild(
    createSlider("Wave Scale X", 0.002, 0.05, 0.001, draftConfig.water.waveScaleX, (value) => {
      draftConfig.water.waveScaleX = value;
      applyDraftWaterConfig();
    })
  );
  panel.appendChild(
    createSlider("Wave Scale Z", 0.002, 0.05, 0.001, draftConfig.water.waveScaleZ, (value) => {
      draftConfig.water.waveScaleZ = value;
      applyDraftWaterConfig();
    })
  );
  panel.appendChild(
    createSlider("Wave Speed X", -0.12, 0.12, 0.005, draftConfig.water.waveSpeedX, (value) => {
      draftConfig.water.waveSpeedX = value;
      applyDraftWaterConfig();
    })
  );
  panel.appendChild(
    createSlider("Wave Speed Z", -0.12, 0.12, 0.005, draftConfig.water.waveSpeedZ, (value) => {
      draftConfig.water.waveSpeedZ = value;
      applyDraftWaterConfig();
    })
  );
  panel.appendChild(
    createSlider("River Discharge", 0.4, 1.8, 0.05, draftConfig.water.riverDischargeStrength, (value) => {
      draftConfig.water.riverDischargeStrength = value;
      applyDraftWaterConfig();
    })
  );
  panel.appendChild(
    createSlider("River Mesh Cutoff", 0.05, 0.6, 0.01, draftConfig.water.riverMeshThreshold, (value) => {
      draftConfig.water.riverMeshThreshold = value;
      applyDraftWaterConfig();
    })
  );
  panel.appendChild(
    createSlider("River Mesh Min Width", 0, 12, 0.5, draftConfig.water.riverMeshMinWidth, (value) => {
      draftConfig.water.riverMeshMinWidth = value;
      applyDraftWaterConfig();
    })
  );
  panel.appendChild(
    createSlider("Lake Mesh Cutoff", 0.02, 0.3, 0.01, draftConfig.water.lakeMeshThreshold, (value) => {
      draftConfig.water.lakeMeshThreshold = value;
      applyDraftWaterConfig();
    })
  );
  panel.appendChild(
    createSlider("Inland Res", 33, 513, 32, draftConfig.water.inlandMeshResolution, (value) => {
      draftConfig.water.inlandMeshResolution = clampErosionResolution(value);
      applyDraftWaterConfig();
    })
  );
  panel.appendChild(
    createSlider("Inland Smooth", 0, 6, 1, draftConfig.water.inlandSmoothingPasses, (value) => {
      draftConfig.water.inlandSmoothingPasses = value;
      applyDraftWaterConfig();
    })
  );
  panel.appendChild(createWaterDebugControl());
  panel.appendChild(
    createColorInput("Shallow Color", draftConfig.water.shallowColor, (value) => {
      draftConfig.water.shallowColor = value;
      applyDraftWaterConfig();
    })
  );
  panel.appendChild(
    createColorInput("Deep Color", draftConfig.water.deepColor, (value) => {
      draftConfig.water.deepColor = value;
      applyDraftWaterConfig();
    })
  );
  panel.appendChild(createDivider());
  panel.appendChild(createSectionLabel("Camera Radius"));
  panel.appendChild(
    createCheckbox("Show Foliage", draftConfig.showFoliage, (checked) => {
      draftConfig.showFoliage = checked;
      demo.setShowFoliage(checked);
      renderHud();
    })
  );
  panel.appendChild(
    createSlider("Collision", 80, 480, 10, draftConfig.collisionRadius, (value) => {
      draftConfig.collisionRadius = value;
      demo.setCollisionRadius(value);
    })
  );
  panel.appendChild(
    createSlider("Foliage", 120, 2000, 10, draftConfig.foliageRadius, (value) => {
      draftConfig.foliageRadius = value;
      demo.setFoliageRadius(value);
    })
  );
  panel.appendChild(
    createSlider(
      "LOD0",
      80,
      280,
      10,
      draftConfig.lodDistances[0],
      (value) => {
        draftConfig.lodDistances[0] = value;
        if (draftConfig.lodDistances[1] <= value) {
          draftConfig.lodDistances[1] = value + 10;
        }
        if (draftConfig.lodDistances[2] <= draftConfig.lodDistances[1]) {
          draftConfig.lodDistances[2] = draftConfig.lodDistances[1] + 10;
        }
        demo.setLodDistances(draftConfig.lodDistances);
      }
    )
  );
  panel.appendChild(
    createSlider(
      "LOD1",
      160,
      420,
      10,
      draftConfig.lodDistances[1],
      (value) => {
        draftConfig.lodDistances[1] = Math.max(value, draftConfig.lodDistances[0] + 10);
        if (draftConfig.lodDistances[2] <= draftConfig.lodDistances[1]) {
          draftConfig.lodDistances[2] = draftConfig.lodDistances[1] + 10;
        }
        demo.setLodDistances(draftConfig.lodDistances);
      }
    )
  );
  panel.appendChild(
    createSlider(
      "LOD2",
      260,
      700,
      10,
      draftConfig.lodDistances[2],
      (value) => {
        draftConfig.lodDistances[2] = Math.max(value, draftConfig.lodDistances[1] + 10);
        demo.setLodDistances(draftConfig.lodDistances);
      }
    )
  );
  panel.appendChild(createDebugModeControl());
}

function renderMaterialTab(): void {
  panel.appendChild(createSectionLabel("Material Blend"));
  panel.appendChild(
    createCheckbox("Use Generated Textures", draftConfig.useGeneratedTextures, (checked) => {
      draftConfig.useGeneratedTextures = checked;
      runAsyncTask(demo.setUseGeneratedTextures(checked));
    })
  );
  panel.appendChild(
    createSlider("Rock Start", 0.05, 0.9, 0.01, draftConfig.materialThresholds.rockSlopeStart, (value) => {
      draftConfig.materialThresholds.rockSlopeStart = Math.min(
        value,
        draftConfig.materialThresholds.rockSlopeFull - 0.02
      );
      demo.setTerrainMaterialThresholds(draftConfig.materialThresholds);
    })
  );
  panel.appendChild(
    createSlider("Rock Full", 0.1, 1, 0.01, draftConfig.materialThresholds.rockSlopeFull, (value) => {
      draftConfig.materialThresholds.rockSlopeFull = Math.max(
        value,
        draftConfig.materialThresholds.rockSlopeStart + 0.02
      );
      demo.setTerrainMaterialThresholds(draftConfig.materialThresholds);
    })
  );
  panel.appendChild(
    createSlider("Grass Max Slope", 0.1, 0.9, 0.01, draftConfig.materialThresholds.grassMaxSlope, (value) => {
      draftConfig.materialThresholds.grassMaxSlope = value;
      demo.setTerrainMaterialThresholds(draftConfig.materialThresholds);
    })
  );
  panel.appendChild(
    createSlider("Snow Start", draftConfig.baseHeight, draftConfig.maxHeight, 1, draftConfig.materialThresholds.snowStartHeight, (value) => {
      draftConfig.materialThresholds.snowStartHeight = Math.min(
        value,
        draftConfig.materialThresholds.snowFullHeight - 1
      );
      demo.setTerrainMaterialThresholds(draftConfig.materialThresholds);
    })
  );
  panel.appendChild(
    createSlider("Snow Full", draftConfig.baseHeight, draftConfig.maxHeight, 1, draftConfig.materialThresholds.snowFullHeight, (value) => {
      draftConfig.materialThresholds.snowFullHeight = Math.max(
        value,
        draftConfig.materialThresholds.snowStartHeight + 1
      );
      demo.setTerrainMaterialThresholds(draftConfig.materialThresholds);
    })
  );
  panel.appendChild(
    createSlider("Dirt Low", draftConfig.baseHeight, draftConfig.maxHeight, 1, draftConfig.materialThresholds.dirtLowHeight, (value) => {
      draftConfig.materialThresholds.dirtLowHeight = Math.min(
        value,
        draftConfig.materialThresholds.dirtHighHeight - 1
      );
      demo.setTerrainMaterialThresholds(draftConfig.materialThresholds);
    })
  );
  panel.appendChild(
    createSlider("Dirt High", draftConfig.baseHeight, draftConfig.maxHeight, 1, draftConfig.materialThresholds.dirtHighHeight, (value) => {
      draftConfig.materialThresholds.dirtHighHeight = Math.max(
        value,
        draftConfig.materialThresholds.dirtLowHeight + 1
      );
      demo.setTerrainMaterialThresholds(draftConfig.materialThresholds);
    })
  );
  panel.appendChild(
    createSlider("Grass Scale", 0.02, 0.2, 0.005, draftConfig.materialScales.grassScale, (value) => {
      draftConfig.materialScales.grassScale = value;
      applyDraftMaterialConfig();
    })
  );
  panel.appendChild(
    createSlider("Dirt Scale", 0.02, 0.2, 0.005, draftConfig.materialScales.dirtScale, (value) => {
      draftConfig.materialScales.dirtScale = value;
      applyDraftMaterialConfig();
    })
  );
  panel.appendChild(
    createSlider("Sand Scale", 0.02, 0.2, 0.005, draftConfig.materialScales.sandScale, (value) => {
      draftConfig.materialScales.sandScale = value;
      applyDraftMaterialConfig();
    })
  );
  panel.appendChild(
    createSlider("Rock Scale", 0.02, 0.2, 0.005, draftConfig.materialScales.rockScale, (value) => {
      draftConfig.materialScales.rockScale = value;
      applyDraftMaterialConfig();
    })
  );
  panel.appendChild(
    createSlider("Snow Scale", 0.02, 0.2, 0.005, draftConfig.materialScales.snowScale, (value) => {
      draftConfig.materialScales.snowScale = value;
      applyDraftMaterialConfig();
    })
  );
  panel.appendChild(
    createSlider("Macro Scale", 0.001, 0.03, 0.001, draftConfig.materialScales.macroScale, (value) => {
      draftConfig.materialScales.macroScale = value;
      applyDraftMaterialConfig();
    })
  );
  panel.appendChild(
    createSlider("Anti-Tile", 0, 1, 0.01, draftConfig.materialScales.antiTileStrength, (value) => {
      draftConfig.materialScales.antiTileStrength = value;
      applyDraftMaterialConfig();
    })
  );
  panel.appendChild(
    createSlider("Blend Sharpness", 0.5, 3, 0.05, draftConfig.blendSharpness, (value) => {
      draftConfig.blendSharpness = value;
      applyDraftMaterialConfig();
    })
  );
  panel.appendChild(
    createSlider("Sediment", 0, 2, 0.05, draftConfig.sedimentStrength, (value) => {
      draftConfig.sedimentStrength = value;
      applyDraftMaterialConfig();
    })
  );
  panel.appendChild(
    createSlider("Sediment Sand", 0, 1, 0.05, draftConfig.sedimentSandBias, (value) => {
      draftConfig.sedimentSandBias = value;
      applyDraftMaterialConfig();
    })
  );
  panel.appendChild(
    createSlider("Small River Tint", 0, 1.5, 0.05, draftConfig.smallRiverTintStrength, (value) => {
      draftConfig.smallRiverTintStrength = value;
      applyDraftMaterialConfig();
    })
  );
  panel.appendChild(
    createSlider("Small River Bright", 0.5, 1.8, 0.05, draftConfig.smallRiverTintBrightness, (value) => {
      draftConfig.smallRiverTintBrightness = value;
      applyDraftMaterialConfig();
    })
  );
  panel.appendChild(
    createSlider("Small River Sat", 0, 1.8, 0.05, draftConfig.smallRiverTintSaturation, (value) => {
      draftConfig.smallRiverTintSaturation = value;
      applyDraftMaterialConfig();
    })
  );
  panel.appendChild(
    createSlider("Beach Start", 0, 8, 0.5, draftConfig.shorelineStartOffset, (value) => {
      draftConfig.shorelineStartOffset = Math.min(value, draftConfig.shorelineEndOffset - 0.5);
      applyDraftMaterialConfig();
    })
  );
  panel.appendChild(
    createSlider("Beach End", 2, 40, 0.5, draftConfig.shorelineEndOffset, (value) => {
      draftConfig.shorelineEndOffset = Math.max(value, draftConfig.shorelineStartOffset + 0.5);
      applyDraftMaterialConfig();
    })
  );
}

function renderWorldTab(): void {
  panel.appendChild(createSectionLabel("Regenerate"));
  panel.appendChild(createTextInput("Seed", draftConfig.seed, (value) => {
    draftConfig.seed = value.trim() === "" ? "1337" : value;
  }));
  panel.appendChild(createDivider());
  panel.appendChild(createSectionLabel("World Size"));
  panel.appendChild(
    createSlider("Chunks / Axis", 6, 16, 1, draftConfig.chunksPerAxis, (value) => {
      draftConfig.chunksPerAxis = value;
      syncDraftWorldBounds();
    })
  );
  panel.appendChild(
    createSlider("Chunk Size", 64, 256, 16, draftConfig.chunkSize, (value) => {
      draftConfig.chunkSize = value;
      syncDraftWorldBounds();
    })
  );
  panel.appendChild(createInfoRow("World Size", String(draftConfig.worldSize)));
  panel.appendChild(
    createSlider("Base Height", -64, 32, 1, draftConfig.baseHeight, (value) => {
      draftConfig.baseHeight = value;
    })
  );
  panel.appendChild(
    createSlider("Max Height", 120, 320, 5, draftConfig.maxHeight, (value) => {
      draftConfig.maxHeight = Math.max(value, draftConfig.baseHeight + 40);
    })
  );
  panel.appendChild(
    createSlider("Continent Amp", 24, 120, 2, draftConfig.shape.continentAmplitude, (value) => {
      draftConfig.shape.continentAmplitude = value;
    })
  );
  panel.appendChild(
    createSlider("Continent Freq", 0.0004, 0.0025, 0.00005, draftConfig.shape.continentFrequency, (value) => {
      draftConfig.shape.continentFrequency = value;
    })
  );
  panel.appendChild(
    createSlider("Radial Falloff", 0.1, 1.2, 0.01, draftConfig.shape.radialFalloffStrength, (value) => {
      draftConfig.shape.radialFalloffStrength = value;
    })
  );
  panel.appendChild(
    createSlider("Mountain Amp", 40, 220, 2, draftConfig.shape.mountainAmplitude, (value) => {
      draftConfig.shape.mountainAmplitude = value;
    })
  );
  panel.appendChild(
    createSlider("Mountain Freq", 0.003, 0.02, 0.0005, draftConfig.shape.mountainFrequency, (value) => {
      draftConfig.shape.mountainFrequency = value;
    })
  );
  panel.appendChild(
    createSlider("Hill Amp", 8, 80, 1, draftConfig.shape.hillAmplitude, (value) => {
      draftConfig.shape.hillAmplitude = value;
    })
  );
  panel.appendChild(
    createSlider("Hill Freq", 0.002, 0.015, 0.0005, draftConfig.shape.hillFrequency, (value) => {
      draftConfig.shape.hillFrequency = value;
    })
  );
  panel.appendChild(
    createSlider("Detail Amp", 0, 18, 0.5, draftConfig.shape.detailAmplitude, (value) => {
      draftConfig.shape.detailAmplitude = value;
    })
  );
  panel.appendChild(
    createSlider("Detail Freq", 0.01, 0.08, 0.001, draftConfig.shape.detailFrequency, (value) => {
      draftConfig.shape.detailFrequency = value;
    })
  );
  panel.appendChild(createDivider());
  panel.appendChild(createSectionLabel("Erosion"));
  panel.appendChild(
    createCheckbox("Enable Erosion", draftConfig.erosion.enabled, (checked) => {
      draftConfig.erosion.enabled = checked;
    })
  );
  panel.appendChild(
    createSlider("Erosion Grid", 65, 513, 32, draftConfig.erosion.resolution, (value) => {
      draftConfig.erosion.resolution = clampErosionResolution(value);
    })
  );
  panel.appendChild(
    createSlider("Iterations", 0, 48, 1, draftConfig.erosion.iterations, (value) => {
      draftConfig.erosion.iterations = value;
    })
  );
  panel.appendChild(
    createSlider("Talus Height", 0.25, 4, 0.05, draftConfig.erosion.talusHeight, (value) => {
      draftConfig.erosion.talusHeight = value;
    })
  );
  panel.appendChild(
    createSlider("Smoothing", 0.02, 0.45, 0.01, draftConfig.erosion.smoothing, (value) => {
      draftConfig.erosion.smoothing = value;
    })
  );
  panel.appendChild(createDivider());
  panel.appendChild(createSectionLabel("Rivers"));
  panel.appendChild(
    createCheckbox("Enable Rivers", draftConfig.rivers.enabled, (checked) => {
      draftConfig.rivers.enabled = checked;
    })
  );
  panel.appendChild(
    createSlider("River Grid", 65, 513, 32, draftConfig.rivers.resolution, (value) => {
      draftConfig.rivers.resolution = clampErosionResolution(value);
    })
  );
  panel.appendChild(
    createSlider("Flow Threshold", 0.45, 0.95, 0.01, draftConfig.rivers.flowThreshold, (value) => {
      draftConfig.rivers.flowThreshold = value;
    })
  );
  panel.appendChild(
    createSlider("Bank Width", 0.2, 1, 0.02, draftConfig.rivers.bankStrength, (value) => {
      draftConfig.rivers.bankStrength = value;
    })
  );
  panel.appendChild(
    createSlider("Lake Threshold", 0.2, 3, 0.05, draftConfig.rivers.lakeThreshold, (value) => {
      draftConfig.rivers.lakeThreshold = value;
    })
  );
  panel.appendChild(
    createSlider("River Depth", 0.2, 6, 0.1, draftConfig.rivers.depth, (value) => {
      draftConfig.rivers.depth = Math.min(value, draftConfig.rivers.maxDepth);
    })
  );
  panel.appendChild(
    createSlider("Max Depth", 1, 14, 0.25, draftConfig.rivers.maxDepth, (value) => {
      draftConfig.rivers.maxDepth = Math.max(value, draftConfig.rivers.depth);
    })
  );
  panel.appendChild(
    createSlider("Min Slope", 0, 0.12, 0.002, draftConfig.rivers.minSlope, (value) => {
      draftConfig.rivers.minSlope = value;
    })
  );
  panel.appendChild(
    createSlider("Min Elevation", 0, 32, 1, draftConfig.rivers.minElevation, (value) => {
      draftConfig.rivers.minElevation = value;
    })
  );
  panel.appendChild(createDivider());
  panel.appendChild(createSectionLabel("POI"));
  panel.appendChild(
    createSlider("POI Density", 0.35, 1.5, 0.05, draftConfig.poi.density, (value) => {
      draftConfig.poi.density = value;
    })
  );
  panel.appendChild(
    createSlider("POI Spacing", 0.7, 1.8, 0.05, draftConfig.poi.spacing, (value) => {
      draftConfig.poi.spacing = value;
    })
  );
  panel.appendChild(createDivider());
  panel.appendChild(createActionButtons());
}

function renderPresetsTab(): void {
  panel.appendChild(createSectionLabel("Presets"));
  panel.appendChild(createPresetControls());
  panel.appendChild(createActionButtons());
}

function createTabBar(): HTMLElement {
  const wrap = document.createElement("div");
  wrap.style.display = "grid";
  wrap.style.gridTemplateColumns = "repeat(4, 1fr)";
  wrap.style.gap = "6px";
  wrap.style.marginTop = "10px";
  wrap.style.width = "100%";
  wrap.style.boxSizing = "border-box";

  const tabs: readonly [PanelTab, string][] = [
    ["runtime", "Runtime"],
    ["material", "Material"],
    ["world", "World"],
    ["presets", "Presets"]
  ];

  tabs.forEach(([tab, label]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.style.padding = "7px 6px";
    button.style.borderRadius = "8px";
    button.style.border = "1px solid rgba(255,255,255,0.16)";
    button.style.background =
      activeTab === tab ? "rgba(56, 93, 123, 0.95)" : "rgba(18, 29, 39, 0.95)";
    button.style.color = "#f4edc9";
    button.style.cursor = "pointer";
    button.style.minWidth = "0";
    button.style.maxWidth = "100%";
    button.style.whiteSpace = "nowrap";
    button.style.overflow = "hidden";
    button.style.textOverflow = "ellipsis";
    button.addEventListener("click", () => {
      activeTab = tab;
      renderPanel();
    });
    wrap.appendChild(button);
  });

  return wrap;
}

function createPresetControls(): HTMLElement {
  const wrap = document.createElement("div");
  wrap.style.display = "grid";
  wrap.style.gap = "8px";
  wrap.style.marginTop = "8px";
  wrap.style.width = "100%";
  wrap.style.boxSizing = "border-box";

  const select = document.createElement("select");
  select.style.width = "100%";
  select.style.maxWidth = "100%";
  select.style.padding = "6px 8px";
  select.style.boxSizing = "border-box";
  select.style.borderRadius = "8px";
  select.style.border = "1px solid rgba(255,255,255,0.16)";
  select.style.background = "rgba(14, 21, 29, 0.95)";
  select.style.color = "#f4edc9";

  presetOptions.forEach((preset, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = preset.name;
    select.appendChild(option);
  });

  const buttons = document.createElement("div");
  buttons.style.display = "grid";
  buttons.style.gridTemplateColumns = "1fr 1fr";
  buttons.style.gap = "8px";
  buttons.style.width = "100%";
  buttons.style.boxSizing = "border-box";

  const apply = createButton("Apply Preset", () => {
    const preset = presetOptions[Number(select.value)];
    draftConfig = mergeDraftWithOverrides(buildDraftConfig(), preset.config);
    if (preset.featureState) {
      draftConfig.poiDebug = clonePoiDebugConfig(preset.featureState.poiDebug);
    }
    return applyDraftToWorld();
  });

  const save = createButton("Save Current", () => {
    const name = window.prompt("Preset name", `Preset ${presetOptions.length - BUILTIN_PRESETS.length + 1}`);
    if (!name) {
      return;
    }

    const customPresets = getSavedPresets();
    customPresets.push({
      name,
      config: buildTerrainOverridesFromDraft(),
      featureState: {
        poiDebug: clonePoiDebugConfig(draftConfig.poiDebug)
      }
    });
    savePresets(customPresets);
    presetOptions = getPresetOptions();
    renderPanel();
    renderFeaturePanel();
  });

  buttons.appendChild(apply);
  buttons.appendChild(save);
  wrap.appendChild(select);
  wrap.appendChild(buttons);
  return wrap;
}

function createDebugModeControl(): HTMLElement {
  const row = document.createElement("label");
  row.style.display = "grid";
  row.style.gap = "4px";
  row.style.marginTop = "8px";
  row.style.width = "100%";
  row.style.minWidth = "0";
  row.style.boxSizing = "border-box";

  const title = document.createElement("div");
  title.textContent = "Terrain View";

  const select = document.createElement("select");
  select.style.width = "100%";
  select.style.maxWidth = "100%";
  select.style.padding = "6px 8px";
  select.style.boxSizing = "border-box";
  select.style.borderRadius = "8px";
  select.style.border = "1px solid rgba(255,255,255,0.16)";
  select.style.background = "rgba(14, 21, 29, 0.95)";
  select.style.color = "#f4edc9";

  const modes: readonly [string, TerrainDebugViewMode][] = [
    ["Final", TerrainDebugViewMode.Final],
    ["Grass Weight", TerrainDebugViewMode.GrassWeight],
    ["Dirt Weight", TerrainDebugViewMode.DirtWeight],
    ["Rock Weight", TerrainDebugViewMode.RockWeight],
    ["Snow Weight", TerrainDebugViewMode.SnowWeight],
    ["Height", TerrainDebugViewMode.Height],
    ["Slope", TerrainDebugViewMode.Slope],
    ["Triplanar Blend", TerrainDebugViewMode.TriplanarBlend],
    ["Erosion", TerrainDebugViewMode.Erosion],
    ["Raw Height", TerrainDebugViewMode.RawHeight],
    ["Flow", TerrainDebugViewMode.Flow],
    ["River", TerrainDebugViewMode.River],
    ["Lake", TerrainDebugViewMode.Lake],
    ["Sediment", TerrainDebugViewMode.Sediment],
    ["River Width", TerrainDebugViewMode.RiverWidth],
    ["Water Transition", TerrainDebugViewMode.WaterTransition]
  ];

  modes.forEach(([label, value]) => {
    const option = document.createElement("option");
    option.value = String(value);
    option.textContent = label;
    option.selected = demo.getDebugViewMode() === value;
    select.appendChild(option);
  });

  select.addEventListener("change", () => {
    demo.setDebugViewMode(Number(select.value) as TerrainDebugViewMode);
  });

  row.appendChild(title);
  row.appendChild(select);
  return row;
}

function createCheckbox(
  label: string,
  initialValue: boolean,
  onChange: (checked: boolean) => void,
  disabled = false
): HTMLElement {
  const row = document.createElement("label");
  row.style.display = "flex";
  row.style.alignItems = "center";
  row.style.gap = "8px";
  row.style.marginTop = "10px";
  row.style.width = "100%";
  row.style.minWidth = "0";
  row.style.boxSizing = "border-box";

  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = initialValue;
  input.disabled = disabled;
  input.style.flex = "0 0 auto";
  input.addEventListener("change", () => onChange(input.checked));

  const title = document.createElement("span");
  title.textContent = label;
  title.style.minWidth = "0";
  title.style.opacity = disabled ? "0.55" : "1";
  row.style.opacity = disabled ? "0.7" : "1";

  row.appendChild(input);
  row.appendChild(title);
  return row;
}

function createActionButtons(): HTMLElement {
  const wrap = document.createElement("div");
  wrap.style.display = "grid";
  wrap.style.gridTemplateColumns = "1fr 1fr";
  wrap.style.gap = "8px";
  wrap.style.marginTop = "12px";

  wrap.appendChild(
    createButton("Rebuild Terrain", () => {
      return applyDraftToWorld();
    })
  );
  wrap.appendChild(
    createButton("Reset Draft", () => {
      draftConfig = buildDraftConfig();
      renderPanel();
    })
  );

  return wrap;
}

function createPoiStatsRow(): HTMLElement {
  const stats = demo.getPoiStats();
  const row = document.createElement("div");
  row.style.marginTop = "8px";
  row.style.padding = "6px 8px";
  row.style.borderRadius = "8px";
  row.style.background = "rgba(14, 21, 29, 0.95)";
  row.style.border = "1px solid rgba(255,255,255,0.1)";
  row.style.color = "#9cb3c3";
  row.style.whiteSpace = "pre-wrap";
  row.textContent =
    `POI ${stats.total}: V ${stats.villages} | H ${stats.harbors} | ` +
    `F ${stats.hillforts} | M ${stats.mines}`;
  return row;
}

function createFeatureBuildStatus(): HTMLElement {
  const row = document.createElement("div");
  row.style.marginTop = "8px";
  row.style.padding = "6px 8px";
  row.style.borderRadius = "8px";
  row.style.background = "rgba(14, 21, 29, 0.95)";
  row.style.border = "1px solid rgba(255,255,255,0.1)";
  row.style.color = "#9cb3c3";
  row.style.whiteSpace = "pre-wrap";
  featureBuildStatusText = row;
  updateFeatureBuildStatus();
  return row;
}

function updateFeatureBuildStatus(): void {
  if (!featureBuildStatusText) {
    return;
  }

  const summary = draftConfig.features.poi
    ? draftConfig.features.roads
      ? "POI and roads will rebuild into the world."
      : "POI will load on rebuild. Roads remain disabled."
    : "POI and roads are excluded by default.";
  const workerLine = workerStatus.workersEnabled
    ? workerStatus.sharedSnapshotsEnabled
      ? "Workers active. Shared snapshots enabled."
      : "Workers active. Shared snapshots unavailable."
    : "Workers unavailable. Main-thread fallback only.";
  const workerDetail =
    `crossOriginIsolated: ${workerStatus.crossOriginIsolated}\n` +
    `SharedArrayBuffer: ${workerStatus.sharedArrayBufferDefined}\n` +
    `Snapshot Mode: ${workerStatus.snapshotMode}`;
  const progress =
    buildStatus.phase === "idle"
      ? ""
      : `\n${buildStatus.message}`;
  featureBuildStatusText.textContent = `${summary}\n${workerLine}\n${workerDetail}${progress}`;
}

function createPoiDebugControls(): HTMLElement {
  const wrap = document.createElement("div");
  wrap.style.display = "grid";
  wrap.style.gap = "6px";
  wrap.style.marginTop = "8px";
  wrap.style.padding = "8px";
  wrap.style.borderRadius = "8px";
  wrap.style.background = "rgba(14, 21, 29, 0.95)";
  wrap.style.border = "1px solid rgba(255,255,255,0.1)";

  const title = document.createElement("div");
  title.textContent = "POI Debug";
  title.style.color = "#9cb3c3";
  wrap.appendChild(title);

  wrap.appendChild(
    createCheckbox("Show Scores", draftConfig.poiDebug.showScores, (checked) => {
      draftConfig.poiDebug.showScores = checked;
      demo.setPoiDebugConfig(draftConfig.poiDebug);
    })
  );
  wrap.appendChild(
    createCheckbox("Show Radii", draftConfig.poiDebug.showRadii, (checked) => {
      draftConfig.poiDebug.showRadii = checked;
      demo.setPoiDebugConfig(draftConfig.poiDebug);
    })
  );
  wrap.appendChild(
    createCheckbox("Show Tags", draftConfig.poiDebug.showTags, (checked) => {
      draftConfig.poiDebug.showTags = checked;
      demo.setPoiDebugConfig(draftConfig.poiDebug);
    })
  );

  ([
    ["Villages", "village"],
    ["Harbors", "harbor"],
    ["Hillforts", "hillfort"],
    ["Mines", "mine"]
  ] as const).forEach(([label, kind]) => {
    wrap.appendChild(
      createCheckbox(label, draftConfig.poiDebug.kinds[kind], (checked) => {
        draftConfig.poiDebug.kinds[kind] = checked;
        demo.setPoiDebugConfig(draftConfig.poiDebug);
        renderHud();
      })
    );
  });

  return wrap;
}

function createWaterDebugControl(): HTMLElement {
  const row = document.createElement("label");
  row.style.display = "grid";
  row.style.gap = "4px";
  row.style.marginTop = "8px";
  row.style.width = "100%";
  row.style.minWidth = "0";
  row.style.boxSizing = "border-box";

  const title = document.createElement("div");
  title.textContent = "Water Debug";

  const select = document.createElement("select");
  select.style.width = "100%";
  select.style.maxWidth = "100%";
  select.style.padding = "6px 8px";
  select.style.boxSizing = "border-box";
  select.style.borderRadius = "8px";
  select.style.border = "1px solid rgba(255,255,255,0.16)";
  select.style.background = "rgba(14, 21, 29, 0.95)";
  select.style.color = "#f4edc9";

  const modes: readonly [string, number][] = [
    ["Final", 0],
    ["Terrain Mask", 1],
    ["Water Depth", 2],
    ["Shore Fade", 3]
  ];

  modes.forEach(([label, value]) => {
    const option = document.createElement("option");
    option.value = String(value);
    option.textContent = label;
    option.selected = draftConfig.water.debugView === value;
    select.appendChild(option);
  });

  select.addEventListener("change", () => {
    draftConfig.water.debugView = Number(select.value);
    applyDraftWaterConfig();
  });

  row.appendChild(title);
  row.appendChild(select);
  return row;
}

async function applyDraftToWorld(): Promise<void> {
  await demo.rebuildTerrain(buildTerrainOverridesFromDraft());
  demo.setCollisionRadius(draftConfig.collisionRadius);
  demo.setFoliageRadius(draftConfig.foliageRadius);
  demo.setShowFoliage(draftConfig.showFoliage);
  demo.setShowPoi(draftConfig.features.poi);
  demo.setPoiDebugConfig(draftConfig.poiDebug);
  demo.setShowRoads(draftConfig.features.roads);
  demo.setLodDistances(draftConfig.lodDistances);
  demo.setWaterLevel(draftConfig.waterLevel);
  demo.setWaterConfig(draftConfig.water);
  applyDraftMaterialConfig();
  debugVisible = false;
  renderHud();
  draftConfig = buildDraftConfig();
  renderPanel();
  renderFeaturePanel();
}

function runAsyncTask(task: Promise<void>): void {
  void task.catch((error: unknown) => {
    console.error(error);
  });
}

function applyDraftMaterialConfig(): void {
  const config = demo.getTerrainMaterialConfig();
  config.thresholds = { ...draftConfig.materialThresholds };
  config.scales = {
    ...config.scales,
    grassScale: draftConfig.materialScales.grassScale,
    dirtScale: draftConfig.materialScales.dirtScale,
    sandScale: draftConfig.materialScales.sandScale,
    rockScale: draftConfig.materialScales.rockScale,
    snowScale: draftConfig.materialScales.snowScale,
    macroScale: draftConfig.materialScales.macroScale,
    antiTileStrength: draftConfig.materialScales.antiTileStrength
  };
  config.blendSharpness = draftConfig.blendSharpness;
  config.shorelineStartOffset = draftConfig.shorelineStartOffset;
  config.shorelineEndOffset = draftConfig.shorelineEndOffset;
  config.sedimentStrength = draftConfig.sedimentStrength;
  config.sedimentSandBias = draftConfig.sedimentSandBias;
  config.smallRiverTintStrength = draftConfig.smallRiverTintStrength;
  config.smallRiverTintBrightness = draftConfig.smallRiverTintBrightness;
  config.smallRiverTintSaturation = draftConfig.smallRiverTintSaturation;
  demo.setTerrainMaterialConfig(config);
}

function applyDraftWaterConfig(): void {
  demo.setWaterConfig(draftConfig.water);
}

function buildDraftConfig(): DraftConfig {
  const config = demo.getTerrainConfig();
  return {
    seed: String(config.seed),
    useGeneratedTextures: demo.getUseGeneratedTextures(),
    worldMin: config.worldMin,
    worldMax: config.worldMax,
    worldSize: config.worldSize,
    chunksPerAxis: config.chunksPerAxis,
    chunkSize: config.chunkSize,
    baseHeight: config.baseHeight,
    maxHeight: config.maxHeight,
    waterLevel: demo.getWaterLevel(),
    water: { ...demo.getWaterConfig() },
    collisionRadius: demo.getCollisionRadius(),
    foliageRadius: demo.getFoliageRadius(),
    showFoliage: demo.getShowFoliage(),
    showPoi: demo.getTerrainConfig().features.poi,
    poiDebug: demo.getPoiDebugConfig(),
    showRoads: demo.getTerrainConfig().features.roads,
    lodDistances: [...demo.getLodDistances()] as [number, number, number],
    materialThresholds: { ...demo.getTerrainMaterialThresholds() },
    materialScales: { ...demo.getTerrainMaterialConfig().scales },
    blendSharpness: demo.getTerrainMaterialConfig().blendSharpness,
    shorelineStartOffset: demo.getTerrainMaterialConfig().shorelineStartOffset,
    shorelineEndOffset: demo.getTerrainMaterialConfig().shorelineEndOffset,
    sedimentStrength: demo.getTerrainMaterialConfig().sedimentStrength,
    sedimentSandBias: demo.getTerrainMaterialConfig().sedimentSandBias,
    smallRiverTintStrength: demo.getTerrainMaterialConfig().smallRiverTintStrength,
    smallRiverTintBrightness:
      demo.getTerrainMaterialConfig().smallRiverTintBrightness,
    smallRiverTintSaturation:
      demo.getTerrainMaterialConfig().smallRiverTintSaturation,
    erosion: { ...config.erosion },
    features: { ...config.features },
    poi: { ...config.poi },
    rivers: { ...config.rivers },
    shape: { ...config.shape }
  };
}

function buildTerrainOverridesFromDraft(): TerrainConfigOverrides {
  return {
    seed: draftConfig.seed,
    worldMin: draftConfig.worldMin,
    worldMax: draftConfig.worldMax,
    chunksPerAxis: draftConfig.chunksPerAxis,
    chunkSize: draftConfig.chunkSize,
    baseHeight: draftConfig.baseHeight,
    maxHeight: draftConfig.maxHeight,
    waterLevel: draftConfig.waterLevel,
    collisionRadius: draftConfig.collisionRadius,
    foliageRadius: draftConfig.foliageRadius,
    lodDistances: draftConfig.lodDistances,
    erosion: { ...draftConfig.erosion },
    features: { ...draftConfig.features },
    poi: { ...draftConfig.poi },
    rivers: { ...draftConfig.rivers },
    shape: { ...draftConfig.shape }
  };
}

function mergeDraftWithOverrides(
  base: DraftConfig,
  overrides: TerrainConfigOverrides
): DraftConfig {
  return {
    seed: String(overrides.seed ?? base.seed),
    useGeneratedTextures: base.useGeneratedTextures,
    worldMin: overrides.worldMin ?? base.worldMin,
    worldMax: overrides.worldMax ?? base.worldMax,
    worldSize:
      (overrides.worldMax ?? base.worldMax) -
      (overrides.worldMin ?? base.worldMin),
    chunksPerAxis: overrides.chunksPerAxis ?? base.chunksPerAxis,
    chunkSize: overrides.chunkSize ?? base.chunkSize,
    baseHeight: overrides.baseHeight ?? base.baseHeight,
    maxHeight: overrides.maxHeight ?? base.maxHeight,
    waterLevel: overrides.waterLevel ?? base.waterLevel,
    water: { ...base.water },
    collisionRadius: overrides.collisionRadius ?? base.collisionRadius,
    foliageRadius: overrides.foliageRadius ?? base.foliageRadius,
    showFoliage: base.showFoliage,
    showPoi: overrides.features?.poi ?? base.showPoi,
    poiDebug: {
      showScores: base.poiDebug.showScores,
      showRadii: base.poiDebug.showRadii,
      showTags: base.poiDebug.showTags,
      kinds: { ...base.poiDebug.kinds }
    },
    showRoads: overrides.features?.roads ?? base.showRoads,
    lodDistances: (overrides.lodDistances
      ? [...overrides.lodDistances]
      : [...base.lodDistances]) as [number, number, number],
    materialThresholds: { ...base.materialThresholds },
    materialScales: { ...base.materialScales },
    blendSharpness: base.blendSharpness,
    shorelineStartOffset: base.shorelineStartOffset,
    shorelineEndOffset: base.shorelineEndOffset,
    sedimentStrength: base.sedimentStrength,
    sedimentSandBias: base.sedimentSandBias,
    smallRiverTintStrength: base.smallRiverTintStrength,
    smallRiverTintBrightness: base.smallRiverTintBrightness,
    smallRiverTintSaturation: base.smallRiverTintSaturation,
    erosion: {
      ...base.erosion,
      ...overrides.erosion
    },
    features: {
      ...base.features,
      ...overrides.features
    },
    poi: {
      ...base.poi,
      ...overrides.poi
    },
    rivers: {
      ...base.rivers,
      ...overrides.rivers
    },
    shape: {
      ...base.shape,
      ...overrides.shape
    }
  };
}

function clonePoiDebugConfig(
  config: MutableTerrainPoiDebugConfig | TerrainPoiDebugConfig
): MutableTerrainPoiDebugConfig {
  return {
    showScores: config.showScores,
    showRadii: config.showRadii,
    showTags: config.showTags,
    kinds: { ...config.kinds }
  };
}

function getPresetOptions(): TerrainPreset[] {
  return [...BUILTIN_PRESETS, ...getSavedPresets()];
}

function getSavedPresets(): TerrainPreset[] {
  const serialized = window.localStorage.getItem(SAVED_PRESETS_KEY);
  if (!serialized) {
    return [];
  }

  try {
    const parsed = JSON.parse(serialized) as TerrainPreset[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function savePresets(presets: TerrainPreset[]): void {
  window.localStorage.setItem(SAVED_PRESETS_KEY, JSON.stringify(presets));
}

function createHeading(text: string): HTMLElement {
  const el = document.createElement("div");
  el.textContent = text;
  el.style.fontSize = "14px";
  el.style.fontWeight = "700";
  return el;
}

function createSectionLabel(text: string): HTMLElement {
  const el = document.createElement("div");
  el.textContent = text;
  el.style.marginTop = "12px";
  el.style.fontSize = "11px";
  el.style.textTransform = "uppercase";
  el.style.letterSpacing = "0.08em";
  el.style.color = "#9cb3c3";
  return el;
}

function createDivider(): HTMLElement {
  const el = document.createElement("div");
  el.style.height = "1px";
  el.style.marginTop = "12px";
  el.style.background = "rgba(255,255,255,0.1)";
  return el;
}

function createInfoRow(label: string, value: string): HTMLElement {
  const el = document.createElement("div");
  el.style.marginTop = "8px";
  el.style.padding = "6px 8px";
  el.style.borderRadius = "8px";
  el.style.background = "rgba(14, 21, 29, 0.95)";
  el.style.border = "1px solid rgba(255,255,255,0.1)";
  el.style.color = "#9cb3c3";
  el.textContent = `${label}: ${value}`;
  return el;
}

function createButton(
  label: string,
  onClick: () => void | Promise<void>
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.style.padding = "8px 10px";
  button.style.borderRadius = "8px";
  button.style.border = "1px solid rgba(255,255,255,0.16)";
  button.style.background = "rgba(18, 29, 39, 0.95)";
  button.style.color = "#f4edc9";
  button.style.cursor = "pointer";
  button.style.width = "100%";
  button.style.maxWidth = "100%";
  button.style.minWidth = "0";
  button.style.boxSizing = "border-box";
  button.addEventListener("click", () => {
    runAsyncTask(Promise.resolve(onClick()));
  });
  return button;
}

function createTextInput(
  label: string,
  initialValue: string,
  onChange: (value: string) => void
): HTMLElement {
  const row = document.createElement("label");
  row.style.display = "grid";
  row.style.gap = "4px";
  row.style.marginTop = "8px";
  row.style.width = "100%";
  row.style.minWidth = "0";
  row.style.boxSizing = "border-box";

  const title = document.createElement("div");
  title.textContent = label;

  const input = document.createElement("input");
  input.type = "text";
  input.value = initialValue;
  input.style.width = "100%";
  input.style.maxWidth = "100%";
  input.style.padding = "6px 8px";
  input.style.boxSizing = "border-box";
  input.style.borderRadius = "8px";
  input.style.border = "1px solid rgba(255,255,255,0.16)";
  input.style.background = "rgba(14, 21, 29, 0.95)";
  input.style.color = "#f4edc9";
  input.addEventListener("change", () => onChange(input.value));

  row.appendChild(title);
  row.appendChild(input);
  return row;
}

function createColorInput(
  label: string,
  initialValue: string,
  onChange: (value: string) => void
): HTMLElement {
  const row = document.createElement("label");
  row.style.display = "grid";
  row.style.gap = "4px";
  row.style.marginTop = "8px";
  row.style.width = "100%";
  row.style.minWidth = "0";
  row.style.boxSizing = "border-box";

  const title = document.createElement("div");
  title.textContent = label;

  const input = document.createElement("input");
  input.type = "color";
  input.value = initialValue;
  input.style.width = "100%";
  input.style.height = "32px";
  input.style.maxWidth = "100%";
  input.style.padding = "2px";
  input.style.boxSizing = "border-box";
  input.style.borderRadius = "8px";
  input.style.border = "1px solid rgba(255,255,255,0.16)";
  input.style.background = "rgba(14, 21, 29, 0.95)";
  input.addEventListener("input", () => onChange(input.value));

  row.appendChild(title);
  row.appendChild(input);
  return row;
}

function createSlider(
  label: string,
  min: number,
  max: number,
  step: number,
  initialValue: number,
  onInput: (value: number) => void
): HTMLElement {
  const row = document.createElement("label");
  row.style.display = "grid";
  row.style.gap = "4px";
  row.style.marginTop = "8px";
  row.style.width = "100%";
  row.style.minWidth = "0";
  row.style.boxSizing = "border-box";

  const title = document.createElement("div");
  title.textContent = `${label}: ${formatValue(initialValue, step)}`;

  const input = document.createElement("input");
  input.type = "range";
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(initialValue);
  input.style.width = "100%";
  input.style.maxWidth = "100%";
  input.style.boxSizing = "border-box";

  input.addEventListener("input", () => {
    const value = Number(input.value);
    title.textContent = `${label}: ${formatValue(value, step)}`;
    onInput(value);
  });
  row.appendChild(title);
  row.appendChild(input);
  return row;
}

function formatValue(value: number, step: number): string {
  return step >= 1 ? String(value) : value.toFixed(getDecimalPlaces(step));
}

function getDecimalPlaces(step: number): number {
  const stepText = String(step);
  const dotIndex = stepText.indexOf(".");
  return dotIndex === -1 ? 0 : stepText.length - dotIndex - 1;
}

interface DraftConfig {
  seed: string;
  useGeneratedTextures: boolean;
  worldMin: number;
  worldMax: number;
  worldSize: number;
  chunksPerAxis: number;
  chunkSize: number;
  baseHeight: number;
  maxHeight: number;
  waterLevel: number;
  water: MutableTerrainWaterConfig;
  collisionRadius: number;
  foliageRadius: number;
  showFoliage: boolean;
  showPoi: boolean;
  poiDebug: MutableTerrainPoiDebugConfig;
  showRoads: boolean;
  features: MutableTerrainFeatureConfig;
  lodDistances: [number, number, number];
  materialThresholds: TerrainLayerThresholds;
  materialScales: {
    grassScale: number;
    dirtScale: number;
    sandScale: number;
    rockScale: number;
    snowScale: number;
    macroScale: number;
    antiTileStrength: number;
  };
  blendSharpness: number;
  shorelineStartOffset: number;
  shorelineEndOffset: number;
  sedimentStrength: number;
  sedimentSandBias: number;
  smallRiverTintStrength: number;
  smallRiverTintBrightness: number;
  smallRiverTintSaturation: number;
  erosion: MutableTerrainErosionConfig;
  poi: MutableTerrainPoiConfig;
  rivers: MutableTerrainRiverConfig;
  shape: MutableTerrainShapeConfig;
}

type MutableTerrainShapeConfig = {
  -readonly [Key in keyof TerrainShapeConfig]: TerrainShapeConfig[Key];
};

type MutableTerrainErosionConfig = {
  -readonly [Key in keyof TerrainErosionConfig]: TerrainErosionConfig[Key];
};

type MutableTerrainPoiConfig = {
  -readonly [Key in keyof TerrainPoiConfig]: TerrainPoiConfig[Key];
};

type MutableTerrainFeatureConfig = {
  -readonly [Key in keyof TerrainFeatureConfig]: TerrainFeatureConfig[Key];
};

type MutableTerrainPoiDebugConfig = {
  showScores: boolean;
  showRadii: boolean;
  showTags: boolean;
  kinds: Record<TerrainPoiKind, boolean>;
};

type MutableTerrainRiverConfig = {
  -readonly [Key in keyof TerrainRiverConfig]: TerrainRiverConfig[Key];
};

type MutableTerrainWaterConfig = {
  -readonly [Key in keyof TerrainWaterConfig]: TerrainWaterConfig[Key];
};

function clampErosionResolution(value: number): number {
  const rounded = Math.round(value);
  const clamped = Math.max(65, Math.min(513, rounded));
  return clamped % 2 === 0 ? clamped + 1 : clamped;
}

function syncDraftWorldBounds(): void {
  draftConfig.worldSize = draftConfig.chunksPerAxis * draftConfig.chunkSize;
  draftConfig.worldMin = -draftConfig.worldSize * 0.5;
  draftConfig.worldMax = draftConfig.worldSize * 0.5;
}
