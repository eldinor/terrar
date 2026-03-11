# Babylon.js Terrain Material Upgrade --- AI Implementation Spec

## Texture Blending + Triplanar Mapping

## Purpose

This document instructs an AI coding agent to implement **Version 2
terrain rendering** for an existing **Babylon.js + TypeScript chunked
terrain system**.

The terrain system already includes: - finite world - procedural
generation - chunked terrain - per‑chunk LOD - seam handling - foliage
system

The goal of this upgrade is to add:

-   terrain texture blending
-   triplanar material support
-   debug visualization
-   future biome integration

------------------------------------------------------------------------

# 1. Rendering Model

Terrain shading must be based on **layer blending**.

Example weights:

grass = 0.55\
dirt = 0.20\
rock = 0.20\
snow = 0.05

Weights must be normalized.

Layers supported:

-   grass
-   dirt
-   rock
-   snow

------------------------------------------------------------------------

# 2. Weight Drivers

Layer weights depend on:

-   height
-   slope
-   moisture (optional)
-   temperature (optional)
-   biome (future)

Minimum required inputs:

height and slope.

Example rules:

rockWeight = smoothstep(rockSlopeStart, rockSlopeFull, slope)\
snowWeight = smoothstep(snowStartHeight, snowFullHeight, height)

Grass dominates mid‑height low slope regions.

Dirt fills transitions.

------------------------------------------------------------------------

# 3. Triplanar Mapping

Rock textures must use **triplanar mapping** to avoid stretching on
cliffs.

Concept:

Project textures from X, Y, and Z axes and blend based on normal
direction.

Example blend weights:

blend = abs(normal)\
blend = pow(blend, sharpness)\
blend /= sum(blend)

Then blend:

XY projection\
XZ projection\
YZ projection

------------------------------------------------------------------------

# 4. Shader Pipeline

Shader flow:

1.  read world position
2.  read world normal
3.  compute slope = 1 - normal.y
4.  compute layer weights
5.  sample textures
6.  apply triplanar sampling for rock
7.  blend layers
8.  output final color

------------------------------------------------------------------------

# 5. Material Modules

Recommended folder structure:

src/terrain/materials/

TerrainMaterialConfig.ts\
TerrainLayerWeights.ts\
TerrainTextureSet.ts\
TerrainTriplanarUtils.ts\
TerrainMaterialFactory.ts\
TerrainMaterialDebug.ts

------------------------------------------------------------------------

# 6. TerrainLayerWeights

API example:

export interface TerrainSurfaceInput { height: number slope: number
moisture: number temperature: number }

export interface TerrainLayerWeights { grass: number dirt: number rock:
number snow: number }

Weights must be smooth and normalized.

------------------------------------------------------------------------

# 7. Texture Set

Each layer supports:

-   albedo
-   optional normal
-   optional roughness

Example:

export interface TerrainTextureLayer { albedo: BABYLON.Texture normal?:
BABYLON.Texture }

export interface TerrainTextureSet { grass: TerrainTextureLayer dirt:
TerrainTextureLayer rock: TerrainTextureLayer snow: TerrainTextureLayer
}

------------------------------------------------------------------------

# 8. Debug Modes

Material must support runtime debug modes:

Final\
GrassWeight\
DirtWeight\
RockWeight\
SnowWeight\
Height\
Slope

This helps tune terrain blending.

------------------------------------------------------------------------

# 9. Integration Requirements

The material must work with:

-   chunk meshes
-   all LOD levels
-   existing terrain system
-   foliage system

The same material instance should be shared across chunks.

------------------------------------------------------------------------

# 10. Performance Constraints

Do not:

-   sample unnecessary layers
-   use triplanar everywhere
-   rebuild terrain meshes

Keep the shader efficient.

Target: visually improved terrain without major FPS drop.

------------------------------------------------------------------------

# 11. Acceptance Criteria

Implementation is complete when:

-   terrain uses multiple blended layers
-   rock appears on steep slopes
-   snow appears on high elevation
-   cliffs do not show stretched textures
-   blending transitions are smooth
-   debug modes work
-   the material works across all chunk LODs
-   code is modular and configurable

------------------------------------------------------------------------

# Final Instruction

Implement this as a reusable rendering subsystem.

Prioritize:

1.  correct weight calculation
2.  triplanar rock mapping
3.  smooth blending
4.  chunk system compatibility
5.  debugability
