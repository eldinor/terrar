
# Babylon.js Terrain V2 Upgrade Pack — AI Implementation Spec
## Texture Blending + Triplanar Mapping + Shader Architecture

## Purpose

This document is a full **Version 2 terrain rendering upgrade pack** for an existing
**Babylon.js + TypeScript chunked terrain system**.

The current system already includes:

- finite procedural terrain
- chunked world
- per-chunk LOD
- seam handling
- foliage system

This upgrade adds:

- multi-layer terrain texture blending
- triplanar mapping for rock/cliffs
- shader architecture guidance
- ShaderMaterial integration guidance
- NodeMaterial alternative guidance
- weight computation pseudocode
- texture packing recommendations
- performance tuning rules
- debug visualization modes

This document is intended for an AI coding agent or engineer implementing the rendering upgrade.

---

# 1. Upgrade Goals

Implement a terrain material system that supports:

- grass / dirt / rock / snow layered blending
- smooth transitions driven by slope and height
- optional moisture / temperature / biome influence
- triplanar mapping for rock
- world-space stable texturing
- debug modes for visualizing masks and weights
- one shared terrain material reused across terrain chunks

---

# 2. Recommended Folder Structure

```text
src/
  terrain/
    materials/
      TerrainMaterialConfig.ts
      TerrainLayerWeights.ts
      TerrainTextureSet.ts
      TerrainMaterialDebug.ts
      TerrainMaterialFactory.ts
      TerrainMaterialUniforms.ts
      shaders/
        terrainBlend.vertex.fx
        terrainBlend.fragment.fx
      utils/
        TerrainTriplanarUtils.glsl
        TerrainLayerWeightUtils.glsl
```

If the project already has a different layout, preserve the same responsibilities.

---

# 3. Required Layer Set

Minimum supported layers:

- grass
- dirt
- rock
- snow

Optional future layers:

- sand
- wet mud
- scree
- alpine grass
- moss
- volcanic rock

---

# 4. Terrain Material Config

Create a config module that defines blending thresholds and texture scales.

Suggested interface:

```ts
export interface TerrainLayerThresholds {
  rockSlopeStart: number;
  rockSlopeFull: number;
  snowStartHeight: number;
  snowFullHeight: number;
  grassMaxSlope: number;
  dirtLowHeight: number;
  dirtHighHeight: number;
}

export interface TerrainTextureScaleConfig {
  grassScale: number;
  dirtScale: number;
  rockScale: number;
  snowScale: number;
  macroScale: number;
}

export interface TerrainMaterialConfig {
  thresholds: TerrainLayerThresholds;
  scales: TerrainTextureScaleConfig;
  blendSharpness: number;
  triplanarSharpness: number;
  normalStrength: number;
  debugMode: number;
}
```

Suggested defaults:

```ts
rockSlopeStart = 0.28
rockSlopeFull  = 0.72
snowStartHeight = 110.0
snowFullHeight  = 155.0
grassMaxSlope   = 0.35
dirtLowHeight   = 0.0
dirtHighHeight  = 80.0

grassScale = 0.08
dirtScale  = 0.09
rockScale  = 0.06
snowScale  = 0.05
macroScale = 0.003

triplanarSharpness = 4.0
blendSharpness = 1.0
normalStrength = 1.0
```

---

# 5. Terrain Surface Inputs

The blending system should operate from terrain inputs.

```ts
export interface TerrainSurfaceInput {
  height: number;
  slope: number;
  moisture: number;
  temperature: number;
  biome?: string;
}
```

Minimum required:
- height
- slope

Preferred:
- height
- slope
- moisture
- temperature

---

# 6. Layer Weight System

Create a reusable weight calculator.

```ts
export interface TerrainLayerWeights {
  grass: number;
  dirt: number;
  rock: number;
  snow: number;
}
```

Suggested function:

```ts
export function computeTerrainLayerWeights(
  input: TerrainSurfaceInput,
  config: TerrainMaterialConfig
): TerrainLayerWeights;
```

## Required behavior

- weights must be deterministic
- transitions must be smooth
- no binary cutoffs unless explicitly in debug mode
- weights must be normalized

## Simple reference logic

```ts
const rock = smoothstep(rockSlopeStart, rockSlopeFull, slope);
const snow = smoothstep(snowStartHeight, snowFullHeight, height);

const flatness = 1.0 - clamp01(slope / grassMaxSlope);
const grassHeightFavor = 1.0 - smoothstep(snowStartHeight * 0.7, snowStartHeight, height);
const grass = flatness * grassHeightFavor * (1.0 - rock) * (1.0 - snow);

const dirtHeightFavor = 1.0 - smoothstep(dirtHighHeight, snowStartHeight * 0.5, height);
const dirt = dirtHeightFavor * (1.0 - snow) * (1.0 - rock * 0.5);

normalize(grass, dirt, rock, snow);
```

## Recommended conceptual behavior

- rock increases with slope
- snow increases with elevation
- grass prefers flatter mid-elevation surfaces
- dirt fills low and transition zones

---

# 7. Slope Metric

A cheap and stable slope metric can come from the normal:

```text
slope = 1.0 - normal.y
```

Where:
- horizontal surface => normal.y close to 1 => slope close to 0
- vertical cliff => normal.y close to 0 => slope close to 1

This is the preferred first implementation in the shader.

Alternative:
- compute slope from sampled height derivatives on CPU or in shader

---

# 8. Texture Resource Model

Create a texture resource wrapper.

```ts
export interface TerrainTextureLayer {
  albedo: BABYLON.Texture;
  normal?: BABYLON.Texture;
  roughness?: BABYLON.Texture;
}

export interface TerrainTextureSet {
  grass: TerrainTextureLayer;
  dirt: TerrainTextureLayer;
  rock: TerrainTextureLayer;
  snow: TerrainTextureLayer;
}
```

## Minimum required textures

- grass_albedo
- dirt_albedo
- rock_albedo
- snow_albedo

## Recommended next step

- grass_normal
- dirt_normal
- rock_normal
- snow_normal

Optional:
- packed ORM maps

---

# 9. Texture Coordinate Strategy

Use **world-space texture mapping** for stability across chunks and LODs.

Recommended:
- grass: world-space planar mapping
- dirt: world-space planar mapping
- rock: triplanar mapping
- snow: planar or optional triplanar for alpine cliffs

Avoid depending only on per-chunk local UVs for cliff materials.

This is important for:
- chunk seam consistency
- LOD consistency
- fewer visible texture jumps

---

# 10. Triplanar Mapping

Triplanar mapping projects a texture along three axes and blends samples according to the world normal.

## Blend logic

```glsl
vec3 blend = abs(worldNormal);
blend = pow(blend, vec3(triplanarSharpness));
blend /= max(blend.x + blend.y + blend.z, 0.0001);
```

## Sample projections

Common projections:

- Y-projection (top-down): worldPos.xz
- X-projection (side): worldPos.zy
- Z-projection (side): worldPos.xy

## Conceptual GLSL helper

```glsl
vec4 sampleTriplanar(sampler2D tex, vec3 worldPos, vec3 worldNormal, float scale, float sharpness) {
    vec3 blend = abs(worldNormal);
    blend = pow(blend, vec3(sharpness));
    blend /= max(blend.x + blend.y + blend.z, 0.0001);

    vec4 xSample = texture(tex, worldPos.zy * scale);
    vec4 ySample = texture(tex, worldPos.xz * scale);
    vec4 zSample = texture(tex, worldPos.xy * scale);

    return xSample * blend.x + ySample * blend.y + zSample * blend.z;
}
```

## Required use

At minimum:
- rock layer must use triplanar mapping

Optional:
- snow can also use triplanar on steep alpine slopes

---

# 11. Shader Architecture

The material system should be structured, not monolithic.

Recommended split:

## Vertex shader responsibilities

- transform position
- provide world position to fragment shader
- provide world normal to fragment shader
- provide optional UV
- preserve compatibility with Babylon chunk meshes

## Fragment shader responsibilities

- compute slope from normal
- compute terrain layer weights
- sample textures
- use triplanar for rock
- blend albedo
- optionally blend normals
- support debug output modes

---

# 12. Suggested Vertex Shader Skeleton

```glsl
precision highp float;

attribute vec3 position;
attribute vec3 normal;
attribute vec2 uv;

uniform mat4 world;
uniform mat4 viewProjection;

varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying vec2 vUV;

void main(void) {
    vec4 worldPos = world * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;

    vWorldNormal = normalize(mat3(world) * normal);
    vUV = uv;

    gl_Position = viewProjection * worldPos;
}
```

---

# 13. Suggested Fragment Shader Skeleton

```glsl
precision highp float;

varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying vec2 vUV;

uniform sampler2D grassAlbedo;
uniform sampler2D dirtAlbedo;
uniform sampler2D rockAlbedo;
uniform sampler2D snowAlbedo;

uniform float grassScale;
uniform float dirtScale;
uniform float rockScale;
uniform float snowScale;

uniform float rockSlopeStart;
uniform float rockSlopeFull;
uniform float snowStartHeight;
uniform float snowFullHeight;
uniform float triplanarSharpness;

uniform int debugMode;

float saturate(float x) {
    return clamp(x, 0.0, 1.0);
}

float smooth01(float a, float b, float v) {
    return smoothstep(a, b, v);
}

vec4 samplePlanarXZ(sampler2D tex, vec3 worldPos, float scale) {
    return texture(tex, worldPos.xz * scale);
}

vec4 sampleTriplanar(sampler2D tex, vec3 worldPos, vec3 worldNormal, float scale, float sharpness) {
    vec3 blend = abs(worldNormal);
    blend = pow(blend, vec3(sharpness));
    blend /= max(blend.x + blend.y + blend.z, 0.0001);

    vec4 xSample = texture(tex, worldPos.zy * scale);
    vec4 ySample = texture(tex, worldPos.xz * scale);
    vec4 zSample = texture(tex, worldPos.xy * scale);

    return xSample * blend.x + ySample * blend.y + zSample * blend.z;
}

void main(void) {
    vec3 n = normalize(vWorldNormal);
    float slope = 1.0 - saturate(n.y);
    float height = vWorldPos.y;

    float rock = smooth01(rockSlopeStart, rockSlopeFull, slope);
    float snow = smooth01(snowStartHeight, snowFullHeight, height);
    float grass = (1.0 - rock) * (1.0 - snow) * (1.0 - smooth01(0.35, 0.8, slope));
    float dirt = max(0.0, 1.0 - (grass + rock + snow));

    float sumW = max(grass + dirt + rock + snow, 0.0001);
    grass /= sumW;
    dirt  /= sumW;
    rock  /= sumW;
    snow  /= sumW;

    vec4 grassCol = samplePlanarXZ(grassAlbedo, vWorldPos, grassScale);
    vec4 dirtCol  = samplePlanarXZ(dirtAlbedo,  vWorldPos, dirtScale);
    vec4 rockCol  = sampleTriplanar(rockAlbedo, vWorldPos, n, rockScale, triplanarSharpness);
    vec4 snowCol  = samplePlanarXZ(snowAlbedo,  vWorldPos, snowScale);

    vec4 finalCol = grassCol * grass + dirtCol * dirt + rockCol * rock + snowCol * snow;

    if (debugMode == 1) finalCol = vec4(vec3(grass), 1.0);
    else if (debugMode == 2) finalCol = vec4(vec3(dirt), 1.0);
    else if (debugMode == 3) finalCol = vec4(vec3(rock), 1.0);
    else if (debugMode == 4) finalCol = vec4(vec3(snow), 1.0);
    else if (debugMode == 5) finalCol = vec4(vec3(height / 180.0), 1.0);
    else if (debugMode == 6) finalCol = vec4(vec3(slope), 1.0);

    gl_FragColor = finalCol;
}
```

This skeleton is intentionally simple and should be refined.

---

# 14. Babylon.js ShaderMaterial Integration

Preferred implementation path:
- use `BABYLON.ShaderMaterial`

Suggested setup tasks:

1. register shader source
2. create shared terrain material
3. bind terrain textures
4. bind scale and threshold uniforms
5. expose debug mode switching
6. assign one shared material to all terrain chunks

Example responsibilities for `TerrainMaterialFactory.ts`:

```ts
export class TerrainMaterialFactory {
  static async createTerrainMaterial(
    scene: BABYLON.Scene,
    textures: TerrainTextureSet,
    config: TerrainMaterialConfig
  ): Promise<BABYLON.ShaderMaterial> {
    // create material
    // bind textures
    // set floats and debug uniforms
    // return material
  }
}
```

## Required material behavior

- reusable across chunks
- same material works on all LODs
- thresholds adjustable without mesh rebuild
- debug mode adjustable at runtime

---

# 15. NodeMaterial Alternative

If the codebase already uses Babylon NodeMaterial, a NodeMaterial version is acceptable.

However:

- the graph must remain maintainable
- triplanar logic must still be explicit and configurable
- debug modes must still exist
- layer weights must still be clearly represented

Use NodeMaterial only if the existing project is already committed to it.

Default recommendation:
- `ShaderMaterial`

---

# 16. Normal Map Upgrade Path

Version 2 can ship with albedo-only blending if necessary.

Recommended next step:
- add normal maps per layer

## Normal blending rules

- grass/dirt normals can use planar world-space sampling
- rock normals should use triplanar sampling
- blend normals using the same layer weights
- normalize final normal

## Important note

Normal blending is more complex than albedo blending.
If normal handling delays delivery, keep V2 albedo-first and add normals in V2.1.

---

# 17. Roughness / ORM Upgrade Path

After albedo and normals:
- support roughness blending
- optionally use packed ORM textures
- rock should usually be rougher than snow highlights but this depends on art style
- wetness overlays can be added later

---

# 18. Debug View Modes

The material must support runtime debug visualization.

Suggested enum:

```ts
export enum TerrainDebugViewMode {
  Final = 0,
  GrassWeight = 1,
  DirtWeight = 2,
  RockWeight = 3,
  SnowWeight = 4,
  Height = 5,
  Slope = 6,
  TriplanarBlend = 7
}
```

## Required minimum debug modes

- final shaded output
- grass weight
- dirt weight
- rock weight
- snow weight
- height
- slope

Optional:
- triplanar blend contribution
- macro variation mask
- biome mask

These are mandatory for tuning.

---

# 19. Weight Computation Pseudocode

A CPU reference function is useful even if shader computes the final weights.

```ts
function computeTerrainLayerWeights(input, cfg) {
  const rock = smoothstep(cfg.thresholds.rockSlopeStart, cfg.thresholds.rockSlopeFull, input.slope);
  const snow = smoothstep(cfg.thresholds.snowStartHeight, cfg.thresholds.snowFullHeight, input.height);

  const grassSlopeFavor = 1.0 - smoothstep(cfg.thresholds.grassMaxSlope * 0.5, cfg.thresholds.grassMaxSlope, input.slope);
  const grassHeightFavor = 1.0 - smoothstep(cfg.thresholds.snowStartHeight * 0.6, cfg.thresholds.snowStartHeight, input.height);
  let grass = grassSlopeFavor * grassHeightFavor * (1.0 - rock) * (1.0 - snow);

  const dirtLowFavor = 1.0 - smoothstep(cfg.thresholds.dirtHighHeight, cfg.thresholds.snowStartHeight * 0.5, input.height);
  let dirt = dirtLowFavor * (1.0 - snow) * (1.0 - rock * 0.6);

  let sum = grass + dirt + rock + snow;
  if (sum < 0.0001) {
    grass = 0.0; dirt = 1.0; 
    return { grass, dirt, rock: 0.0, snow: 0.0 };
  }

  return {
    grass: grass / sum,
    dirt: dirt / sum,
    rock: rock / sum,
    snow: snow / sum
  };
}
```

---

# 20. Texture Packing Recommendations

Start simple:
- one albedo texture per layer
- optional one normal texture per layer

Later optimize:

## Option A
- packed ORM textures per layer

## Option B
- texture arrays if supported by project constraints

## Option C
- atlas only if it does not complicate filtering and authoring too much

Preferred V2 path:
- simple separate textures
- optimize only after profiling

---

# 21. Performance Rules

Do not ship a material that looks good but is too expensive.

## Required rules

- keep first version to 4 layers
- use triplanar only for rock
- avoid unnecessary dynamic branches
- use one shared material across all chunks when possible
- prefer world-space sampling over rebuilding chunk UV logic
- do not rebuild geometry to tweak blend thresholds

## Sensible target

Improve visuals significantly over vertex colors without a major FPS collapse.

## Practical tips

- albedo-only first if needed
- normals second
- roughness third
- keep debug mode cheap and uniform-driven
- avoid sampling rock triplanar if rock weight is nearly zero, only if branch cost is beneficial on target platform; profile this

---

# 22. Integration Constraints

The new material must not break:

- chunk LOD switching
- seam handling
- foliage ownership
- per-chunk transforms
- shared terrain runtime behavior

The material must behave consistently across:
- all chunk meshes
- all LODs
- all chunk positions

This is why world-space texturing is strongly preferred.

---

# 23. Suggested Implementation Order

## Phase 1
- create material config
- create CPU reference weight function
- define texture set interfaces
- define debug modes

## Phase 2
- implement simple ShaderMaterial
- planar world-space mapping for all 4 layers
- weight blending in fragment shader

## Phase 3
- add triplanar sampling for rock
- verify cliffs no longer stretch

## Phase 4
- add runtime debug modes
- tune thresholds and scales

## Phase 5
- add normal maps
- optional snow triplanar
- optional macro variation

---

# 24. Acceptance Criteria

Implementation is complete only if:

1. terrain uses multiple blended layers
2. rock appears naturally on steep slopes
3. snow appears naturally at higher elevations
4. transitions are smooth and continuous
5. rock textures do not visibly stretch on cliffs
6. the material works across all chunk LODs
7. the material is reusable across terrain chunks
8. debug visualization modes work at runtime
9. thresholds and scales are configurable without mesh rebuild
10. code is modular and ready for future biome-driven extension

---

# 25. Prohibited Shortcuts

Do not:

- hardcode all logic into a single scene file
- fake blending with a single tinted texture
- depend entirely on chunk-local UVs for cliff materials
- skip weight normalization
- apply triplanar to everything without reason
- rebuild terrain meshes to tweak material blending
- create one material per chunk unless there is a proven need

---

# 26. Final Instruction

Implement this terrain rendering upgrade as a clean, extensible subsystem.

Prioritize in this order:

1. correct layer weighting
2. rock triplanar mapping
3. smooth transitions
4. compatibility with chunked LOD terrain
5. debugability
6. future support for biome-aware materials
