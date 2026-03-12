import type { TerrainConfigOverrides, TerrainShapeConfig } from "./terrain/TerrainConfig";
import {
  TerrainDebugViewMode,
  TerrainLayerThresholds
} from "./terrain/materials";
import { createTerrainDemo } from "./main";

interface TerrainPreset {
  readonly name: string;
  readonly config: TerrainConfigOverrides;
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
panel.style.overflow = "auto";
panel.style.padding = "12px";
panel.style.border = "1px solid rgba(255, 255, 255, 0.18)";
panel.style.borderRadius = "12px";
panel.style.background = "rgba(6, 10, 15, 0.78)";
panel.style.color = "#f4edc9";
panel.style.font = "12px/1.45 Consolas, 'Courier New', monospace";
panel.style.zIndex = "10";
panel.style.userSelect = "none";
panel.style.backdropFilter = "blur(8px)";
document.body.appendChild(panel);

let wireframe = false;
let debugVisible = false;
let loadingDebug = false;
let draftConfig = buildDraftConfig();
let presetOptions = getPresetOptions();

function renderHud(): void {
  const debugState = loadingDebug ? "loading" : debugVisible ? "on" : "off";
  const foliage = demo.getFoliageStats();
  hud.textContent =
    `G debug: ${debugState} | V wireframe: ${wireframe ? "on" : "off"} | ` +
    `foliage: ${foliage.visibleInstances}/${foliage.totalInstances} ` +
    `(T ${foliage.visibleTrees}/${foliage.totalTrees}, ` +
    `B ${foliage.visibleBushes}/${foliage.totalBushes}, ` +
    `R ${foliage.visibleRocks}/${foliage.totalRocks})`;
}

renderHud();
renderPanel();

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
  panel.appendChild(createSectionLabel("Runtime"));

  panel.appendChild(
    createSlider("Water", -24, 32, 1, draftConfig.waterLevel, (value) => {
      draftConfig.waterLevel = value;
      demo.setWaterLevel(value);
    })
  );
  panel.appendChild(
    createSlider("Collision", 80, 480, 10, draftConfig.collisionRadius, (value) => {
      draftConfig.collisionRadius = value;
      demo.setCollisionRadius(value);
    })
  );
  panel.appendChild(
    createSlider("Foliage", 120, 520, 10, draftConfig.foliageRadius, (value) => {
      draftConfig.foliageRadius = value;
      demo.setFoliageRadius(value);
    })
  );
  panel.appendChild(
    createSlider("LOD0", 80, 280, 10, draftConfig.lodDistances[0], (value) => {
      draftConfig.lodDistances[0] = value;
      if (draftConfig.lodDistances[1] <= value) {
        draftConfig.lodDistances[1] = value + 10;
      }
      if (draftConfig.lodDistances[2] <= draftConfig.lodDistances[1]) {
        draftConfig.lodDistances[2] = draftConfig.lodDistances[1] + 10;
      }
      demo.setLodDistances(draftConfig.lodDistances);
      renderPanel();
    })
  );
  panel.appendChild(
    createSlider("LOD1", 160, 420, 10, draftConfig.lodDistances[1], (value) => {
      draftConfig.lodDistances[1] = Math.max(value, draftConfig.lodDistances[0] + 10);
      if (draftConfig.lodDistances[2] <= draftConfig.lodDistances[1]) {
        draftConfig.lodDistances[2] = draftConfig.lodDistances[1] + 10;
      }
      demo.setLodDistances(draftConfig.lodDistances);
      renderPanel();
    })
  );
  panel.appendChild(
    createSlider("LOD2", 260, 700, 10, draftConfig.lodDistances[2], (value) => {
      draftConfig.lodDistances[2] = Math.max(value, draftConfig.lodDistances[1] + 10);
      demo.setLodDistances(draftConfig.lodDistances);
      renderPanel();
    })
  );
  panel.appendChild(createDebugModeControl());
  panel.appendChild(createDivider());
  panel.appendChild(createSectionLabel("Material Blend"));
  panel.appendChild(
    createSlider("Rock Start", 0.05, 0.9, 0.01, draftConfig.materialThresholds.rockSlopeStart, (value) => {
      draftConfig.materialThresholds.rockSlopeStart = Math.min(
        value,
        draftConfig.materialThresholds.rockSlopeFull - 0.02
      );
      demo.setTerrainMaterialThresholds(draftConfig.materialThresholds);
      renderPanel();
    })
  );
  panel.appendChild(
    createSlider("Rock Full", 0.1, 1, 0.01, draftConfig.materialThresholds.rockSlopeFull, (value) => {
      draftConfig.materialThresholds.rockSlopeFull = Math.max(
        value,
        draftConfig.materialThresholds.rockSlopeStart + 0.02
      );
      demo.setTerrainMaterialThresholds(draftConfig.materialThresholds);
      renderPanel();
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
      renderPanel();
    })
  );
  panel.appendChild(
    createSlider("Snow Full", draftConfig.baseHeight, draftConfig.maxHeight, 1, draftConfig.materialThresholds.snowFullHeight, (value) => {
      draftConfig.materialThresholds.snowFullHeight = Math.max(
        value,
        draftConfig.materialThresholds.snowStartHeight + 1
      );
      demo.setTerrainMaterialThresholds(draftConfig.materialThresholds);
      renderPanel();
    })
  );
  panel.appendChild(
    createSlider("Dirt Low", draftConfig.baseHeight, draftConfig.maxHeight, 1, draftConfig.materialThresholds.dirtLowHeight, (value) => {
      draftConfig.materialThresholds.dirtLowHeight = Math.min(
        value,
        draftConfig.materialThresholds.dirtHighHeight - 1
      );
      demo.setTerrainMaterialThresholds(draftConfig.materialThresholds);
      renderPanel();
    })
  );
  panel.appendChild(
    createSlider("Dirt High", draftConfig.baseHeight, draftConfig.maxHeight, 1, draftConfig.materialThresholds.dirtHighHeight, (value) => {
      draftConfig.materialThresholds.dirtHighHeight = Math.max(
        value,
        draftConfig.materialThresholds.dirtLowHeight + 1
      );
      demo.setTerrainMaterialThresholds(draftConfig.materialThresholds);
      renderPanel();
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
    createSlider("Blend Sharpness", 0.5, 3, 0.05, draftConfig.blendSharpness, (value) => {
      draftConfig.blendSharpness = value;
      applyDraftMaterialConfig();
    })
  );
  panel.appendChild(
    createSlider("Beach Start", 0, 8, 0.5, draftConfig.shorelineStartOffset, (value) => {
      draftConfig.shorelineStartOffset = Math.min(value, draftConfig.shorelineEndOffset - 0.5);
      applyDraftMaterialConfig();
      renderPanel();
    })
  );
  panel.appendChild(
    createSlider("Beach End", 2, 40, 0.5, draftConfig.shorelineEndOffset, (value) => {
      draftConfig.shorelineEndOffset = Math.max(value, draftConfig.shorelineStartOffset + 0.5);
      applyDraftMaterialConfig();
      renderPanel();
    })
  );

  panel.appendChild(createDivider());
  panel.appendChild(createSectionLabel("Regenerate"));
  panel.appendChild(createTextInput("Seed", draftConfig.seed, (value) => {
    draftConfig.seed = value.trim() === "" ? "1337" : value;
  }));
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
  panel.appendChild(createSectionLabel("Presets"));
  panel.appendChild(createPresetControls());
  panel.appendChild(createActionButtons());
}

function createPresetControls(): HTMLElement {
  const wrap = document.createElement("div");
  wrap.style.display = "grid";
  wrap.style.gap = "8px";
  wrap.style.marginTop = "8px";

  const select = document.createElement("select");
  select.style.width = "100%";
  select.style.padding = "6px 8px";
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

  const apply = createButton("Apply Preset", () => {
    const preset = presetOptions[Number(select.value)];
    draftConfig = mergeDraftWithOverrides(buildDraftConfig(), preset.config);
    applyDraftToWorld();
  });

  const save = createButton("Save Current", () => {
    const name = window.prompt("Preset name", `Preset ${presetOptions.length - BUILTIN_PRESETS.length + 1}`);
    if (!name) {
      return;
    }

    const customPresets = getSavedPresets();
    customPresets.push({
      name,
      config: buildTerrainOverridesFromDraft()
    });
    savePresets(customPresets);
    presetOptions = getPresetOptions();
    renderPanel();
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

  const title = document.createElement("div");
  title.textContent = "Terrain View";

  const select = document.createElement("select");
  select.style.width = "100%";
  select.style.padding = "6px 8px";
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
    ["Triplanar Blend", TerrainDebugViewMode.TriplanarBlend]
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

function createActionButtons(): HTMLElement {
  const wrap = document.createElement("div");
  wrap.style.display = "grid";
  wrap.style.gridTemplateColumns = "1fr 1fr";
  wrap.style.gap = "8px";
  wrap.style.marginTop = "12px";

  wrap.appendChild(
    createButton("Rebuild Terrain", () => {
      applyDraftToWorld();
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

function applyDraftToWorld(): void {
  demo.rebuildTerrain(buildTerrainOverridesFromDraft());
  demo.setCollisionRadius(draftConfig.collisionRadius);
  demo.setFoliageRadius(draftConfig.foliageRadius);
  demo.setLodDistances(draftConfig.lodDistances);
  demo.setWaterLevel(draftConfig.waterLevel);
  applyDraftMaterialConfig();
  debugVisible = false;
  renderHud();
  draftConfig = buildDraftConfig();
  renderPanel();
}

function applyDraftMaterialConfig(): void {
  const config = demo.getTerrainMaterialConfig();
  config.thresholds = { ...draftConfig.materialThresholds };
  config.scales = {
    ...config.scales,
    grassScale: draftConfig.materialScales.grassScale,
    dirtScale: draftConfig.materialScales.dirtScale,
    sandScale: draftConfig.materialScales.sandScale
    ,
    rockScale: draftConfig.materialScales.rockScale,
    snowScale: draftConfig.materialScales.snowScale,
    macroScale: draftConfig.materialScales.macroScale
  };
  config.blendSharpness = draftConfig.blendSharpness;
  config.shorelineStartOffset = draftConfig.shorelineStartOffset;
  config.shorelineEndOffset = draftConfig.shorelineEndOffset;
  demo.setTerrainMaterialConfig(config);
}

function buildDraftConfig(): DraftConfig {
  const config = demo.getTerrainConfig();
  return {
    seed: String(config.seed),
    baseHeight: config.baseHeight,
    maxHeight: config.maxHeight,
    waterLevel: demo.getWaterLevel(),
    collisionRadius: demo.getCollisionRadius(),
    foliageRadius: demo.getFoliageRadius(),
    lodDistances: [...demo.getLodDistances()] as [number, number, number],
    materialThresholds: { ...demo.getTerrainMaterialThresholds() },
    materialScales: { ...demo.getTerrainMaterialConfig().scales },
    blendSharpness: demo.getTerrainMaterialConfig().blendSharpness,
    shorelineStartOffset: demo.getTerrainMaterialConfig().shorelineStartOffset,
    shorelineEndOffset: demo.getTerrainMaterialConfig().shorelineEndOffset,
    shape: { ...config.shape }
  };
}

function buildTerrainOverridesFromDraft(): TerrainConfigOverrides {
  return {
    seed: draftConfig.seed,
    baseHeight: draftConfig.baseHeight,
    maxHeight: draftConfig.maxHeight,
    waterLevel: draftConfig.waterLevel,
    collisionRadius: draftConfig.collisionRadius,
    foliageRadius: draftConfig.foliageRadius,
    lodDistances: draftConfig.lodDistances,
    shape: { ...draftConfig.shape }
  };
}

function mergeDraftWithOverrides(
  base: DraftConfig,
  overrides: TerrainConfigOverrides
): DraftConfig {
  return {
    seed: String(overrides.seed ?? base.seed),
    baseHeight: overrides.baseHeight ?? base.baseHeight,
    maxHeight: overrides.maxHeight ?? base.maxHeight,
    waterLevel: overrides.waterLevel ?? base.waterLevel,
    collisionRadius: overrides.collisionRadius ?? base.collisionRadius,
    foliageRadius: overrides.foliageRadius ?? base.foliageRadius,
    lodDistances: (overrides.lodDistances
      ? [...overrides.lodDistances]
      : [...base.lodDistances]) as [number, number, number],
    materialThresholds: { ...base.materialThresholds },
    materialScales: { ...base.materialScales },
    blendSharpness: base.blendSharpness,
    shorelineStartOffset: base.shorelineStartOffset,
    shorelineEndOffset: base.shorelineEndOffset,
    shape: {
      ...base.shape,
      ...overrides.shape
    }
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

function createButton(label: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.style.padding = "8px 10px";
  button.style.borderRadius = "8px";
  button.style.border = "1px solid rgba(255,255,255,0.16)";
  button.style.background = "rgba(18, 29, 39, 0.95)";
  button.style.color = "#f4edc9";
  button.style.cursor = "pointer";
  button.addEventListener("click", onClick);
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

  const title = document.createElement("div");
  title.textContent = label;

  const input = document.createElement("input");
  input.type = "text";
  input.value = initialValue;
  input.style.width = "100%";
  input.style.padding = "6px 8px";
  input.style.borderRadius = "8px";
  input.style.border = "1px solid rgba(255,255,255,0.16)";
  input.style.background = "rgba(14, 21, 29, 0.95)";
  input.style.color = "#f4edc9";
  input.addEventListener("change", () => onChange(input.value));

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

  const title = document.createElement("div");
  title.textContent = `${label}: ${formatValue(initialValue, step)}`;

  const input = document.createElement("input");
  input.type = "range";
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(initialValue);
  input.style.width = "100%";

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
  baseHeight: number;
  maxHeight: number;
  waterLevel: number;
  collisionRadius: number;
  foliageRadius: number;
  lodDistances: [number, number, number];
  materialThresholds: TerrainLayerThresholds;
  materialScales: {
    grassScale: number;
    dirtScale: number;
    sandScale: number;
    rockScale: number;
    snowScale: number;
    macroScale: number;
  };
  blendSharpness: number;
  shorelineStartOffset: number;
  shorelineEndOffset: number;
  shape: MutableTerrainShapeConfig;
}

type MutableTerrainShapeConfig = {
  -readonly [Key in keyof TerrainShapeConfig]: TerrainShapeConfig[Key];
};
