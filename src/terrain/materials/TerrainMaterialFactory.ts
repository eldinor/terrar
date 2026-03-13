import { Effect } from "@babylonjs/core/Materials/effect";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector2, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Scene } from "@babylonjs/core/scene";
import {
  cloneTerrainMaterialConfig,
  DEFAULT_TERRAIN_MATERIAL_CONFIG,
  TerrainMaterialConfig
} from "./TerrainMaterialConfig";
import { TerrainDebugViewMode } from "./TerrainMaterialDebug";
import { TerrainTextureSet } from "./TerrainTextureSet";

export interface TerrainTextureOptions {
  useGeneratedTextures?: boolean;
  maxTextureSize?: number;
}

export const DEFAULT_TERRAIN_TEXTURE_OPTIONS: Required<TerrainTextureOptions> = Object.freeze({
  useGeneratedTextures: true,
  maxTextureSize: 512
});

export class TerrainMaterialFactory {
  static createTerrainMaterial(
    scene: Scene,
    textures?: TerrainTextureSet,
    config: TerrainMaterialConfig = DEFAULT_TERRAIN_MATERIAL_CONFIG,
    textureOptions: TerrainTextureOptions = DEFAULT_TERRAIN_TEXTURE_OPTIONS
  ): ShaderMaterial {
    const resolvedTextures =
      textures ?? this.createDefaultTextureSet(scene, textureOptions);
    ensureTerrainBlendShadersRegistered();

    const material = new ShaderMaterial("terrain-material", scene, "terrainBlend", {
      attributes: ["position", "normal", "uv", "uv2", "uv3", "uv4", "color"],
      uniforms: [
        "world",
        "worldViewProjection",
        "lightDirection",
        "ambientColor",
        "lightColor",
        "waterLevel",
        "riverBankStrength",
        "riverDischargeStrength",
        "riverMeshThreshold",
        "riverMeshMinWidth",
        "roadMaskWorldMin",
        "roadMaskWorldSize",
        "roadTintStrength",
        "grassScale",
        "dirtScale",
        "sandScale",
        "rockScale",
        "snowScale",
        "macroScale",
        "antiTileStrength",
        "rockSlopeStart",
        "rockSlopeFull",
        "snowStartHeight",
        "snowFullHeight",
        "grassMaxSlope",
        "dirtLowHeight",
        "dirtHighHeight",
        "shorelineStartOffset",
        "shorelineEndOffset",
        "sedimentStrength",
        "sedimentSandBias",
        "smallRiverTintStrength",
        "smallRiverTintBrightness",
        "smallRiverTintSaturation",
        "blendSharpness",
        "triplanarSharpness",
        "normalStrength",
        "debugMode",
        "heightDebugMax"
      ],
      samplers: [
        "grassAlbedo",
        "dirtAlbedo",
        "sandAlbedo",
        "rockAlbedo",
        "snowAlbedo",
        "roadMask"
      ]
    });

    material.backFaceCulling = false;
    material.setTexture("grassAlbedo", resolvedTextures.grass.albedo);
    material.setTexture("dirtAlbedo", resolvedTextures.dirt.albedo);
    material.setTexture("sandAlbedo", resolvedTextures.sand.albedo);
    material.setTexture("rockAlbedo", resolvedTextures.rock.albedo);
    material.setTexture("snowAlbedo", resolvedTextures.snow.albedo);
    material.setVector3(
      "lightDirection",
      new Vector3(-0.45, 0.9, 0.3).normalize()
    );
    material.setColor3("ambientColor", new Color3(0.4, 0.43, 0.48));
    material.setColor3("lightColor", new Color3(1, 0.97, 0.92));
    material.setFloat("waterLevel", 0);
    material.setFloat("riverBankStrength", 0.54);
    material.setFloat("riverDischargeStrength", 1);
    material.setFloat("riverMeshThreshold", 0.22);
    material.setFloat("riverMeshMinWidth", 5);
    material.setVector2("roadMaskWorldMin", new Vector2(-512, -512));
    material.setVector2("roadMaskWorldSize", new Vector2(1024, 1024));
    material.setFloat("roadTintStrength", 0.95);
    material.setTexture("roadMask", createBlackMaskTexture(scene));

    this.applyConfig(material, config);
    return material;
  }

  static applyConfig(
    material: ShaderMaterial,
    config: TerrainMaterialConfig = DEFAULT_TERRAIN_MATERIAL_CONFIG
  ): void {
    const { scales, thresholds } = config;
    material.setFloat("grassScale", scales.grassScale);
    material.setFloat("dirtScale", scales.dirtScale);
    material.setFloat("sandScale", scales.sandScale);
    material.setFloat("rockScale", scales.rockScale);
    material.setFloat("snowScale", scales.snowScale);
    material.setFloat("macroScale", scales.macroScale);
    material.setFloat("antiTileStrength", scales.antiTileStrength);
    material.setFloat("rockSlopeStart", thresholds.rockSlopeStart);
    material.setFloat("rockSlopeFull", thresholds.rockSlopeFull);
    material.setFloat("snowStartHeight", thresholds.snowStartHeight);
    material.setFloat("snowFullHeight", thresholds.snowFullHeight);
    material.setFloat("grassMaxSlope", thresholds.grassMaxSlope);
    material.setFloat("dirtLowHeight", thresholds.dirtLowHeight);
    material.setFloat("dirtHighHeight", thresholds.dirtHighHeight);
    material.setFloat("shorelineStartOffset", config.shorelineStartOffset);
    material.setFloat("shorelineEndOffset", config.shorelineEndOffset);
    material.setFloat("sedimentStrength", config.sedimentStrength);
    material.setFloat("sedimentSandBias", config.sedimentSandBias);
    material.setFloat("smallRiverTintStrength", config.smallRiverTintStrength);
    material.setFloat(
      "smallRiverTintBrightness",
      config.smallRiverTintBrightness
    );
    material.setFloat(
      "smallRiverTintSaturation",
      config.smallRiverTintSaturation
    );
    material.setFloat("blendSharpness", config.blendSharpness);
    material.setFloat("triplanarSharpness", config.triplanarSharpness);
    material.setFloat("normalStrength", config.normalStrength);
    material.setInt("debugMode", config.debugMode);
    material.setFloat(
      "heightDebugMax",
      Math.max(thresholds.snowFullHeight, 1)
    );
    material.metadata = {
      ...(material.metadata ?? {}),
      terrainMaterialConfig: cloneTerrainMaterialConfig(config)
    };
  }

  static getConfig(material: ShaderMaterial): TerrainMaterialConfig | null {
    const config = material.metadata?.terrainMaterialConfig as
      | TerrainMaterialConfig
      | undefined;
    return config ? cloneTerrainMaterialConfig(config) : null;
  }

  static setDebugMode(
    material: ShaderMaterial,
    debugMode: TerrainDebugViewMode
  ): void {
    material.setInt("debugMode", debugMode);
  }

  static setWaterLevel(material: ShaderMaterial, waterLevel: number): void {
    material.setFloat("waterLevel", waterLevel);
  }

  static setRiverRenderingParams(
    material: ShaderMaterial,
    params: {
      bankStrength: number;
      dischargeStrength: number;
      meshThreshold: number;
      meshMinWidth: number;
    }
  ): void {
    material.setFloat("riverBankStrength", params.bankStrength);
    material.setFloat("riverDischargeStrength", params.dischargeStrength);
    material.setFloat("riverMeshThreshold", params.meshThreshold);
    material.setFloat("riverMeshMinWidth", params.meshMinWidth);
  }

  static setRoadMask(
    material: ShaderMaterial,
    roadMask: Texture | null
  ): void {
    material.setTexture(
      "roadMask",
      roadMask ?? createBlackMaskTexture(material.getScene())
    );
  }

  static setRoadMaskBounds(
    material: ShaderMaterial,
    worldMin: { x: number; z: number },
    worldSize: { x: number; z: number }
  ): void {
    material.setVector2("roadMaskWorldMin", new Vector2(worldMin.x, worldMin.z));
    material.setVector2("roadMaskWorldSize", new Vector2(worldSize.x, worldSize.z));
  }

  private static createDefaultTextureSet(
    scene: Scene,
    textureOptions: TerrainTextureOptions = DEFAULT_TERRAIN_TEXTURE_OPTIONS
  ): TerrainTextureSet {
    const options = {
      ...DEFAULT_TERRAIN_TEXTURE_OPTIONS,
      ...textureOptions
    };

    if (!options.useGeneratedTextures && typeof window !== "undefined") {
      return this.createLocalTextureSet(scene, options.maxTextureSize);
    }

    return this.createGeneratedTextureSet(scene);
  }

  private static createLocalTextureSet(
    scene: Scene,
    maxTextureSize: number
  ): TerrainTextureSet {
    return {
      grass: {
        albedo: createFileTexture(scene, "/assets/terrain/grass.jpg", maxTextureSize)
      },
      dirt: {
        albedo: createFileTexture(scene, "/assets/terrain/dirt.jpg", maxTextureSize)
      },
      sand: {
        albedo: createFileTexture(scene, "/assets/terrain/sand.jpg", maxTextureSize)
      },
      rock: {
        albedo: createFileTexture(scene, "/assets/terrain/rock.png", maxTextureSize)
      },
      snow: {
        albedo: createFileTexture(scene, "/assets/terrain/snow.png", maxTextureSize)
      }
    };
  }

  private static createGeneratedTextureSet(scene: Scene): TerrainTextureSet {
    const size = 192;

    return {
      grass: {
        albedo: createLayerTexture(scene, size, (x, y, sizePx) => {
          const u = x / sizePx;
          const v = y / sizePx;
          const blades = fbm2(u * 7.5, v * 7.5, 4, 2.05, 0.5);
          const broad = fbm2(u * 2.2 + 8.1, v * 2.2 - 3.4, 3, 2.0, 0.5);
          const stripe = ridgeFbm2(u * 9.0 + 1.7, v * 9.0 - 2.3, 3, 2.0, 0.52);
          const seedHeads = smoothBand(fbm2(u * 15.0 - 4.0, v * 15.0 + 3.0, 2, 2.0, 0.5), 0.62, 0.88);
          const dryPatch = smoothBand(broad, 0.58, 0.88);
          const r = 42 + blades * 18 + stripe * 7 + dryPatch * 16;
          const g = 92 + blades * 44 + seedHeads * 18 - dryPatch * 10;
          const b = 36 + blades * 12 + dryPatch * 8;
          return rgba(r, g, b);
        })
      },
      dirt: {
        albedo: createLayerTexture(scene, size, (x, y, sizePx) => {
          const u = x / sizePx;
          const v = y / sizePx;
          const grain = fbm2(u * 10.0, v * 10.0, 5, 2.1, 0.52);
          const pebbles = smoothBand(fbm2(u * 24.0 + 12.0, v * 24.0 - 6.0, 3, 2.0, 0.55), 0.7, 0.95);
          const sediment = fbm2(u * 6.0 - 2.0, v * 6.0 + 4.0, 3, 2.0, 0.55);
          const r = 86 + grain * 38 + pebbles * 20 + sediment * 8;
          const g = 66 + grain * 24 + pebbles * 11 + sediment * 5;
          const b = 44 + grain * 18 + pebbles * 7;
          return rgba(r, g, b);
        })
      },
      sand: {
        albedo: createLayerTexture(scene, size, (x, y, sizePx) => {
          const u = x / sizePx;
          const v = y / sizePx;
          const warped = warpUv(u, v, 3.5, 0.045);
          const rippleA = ridgeFbm2(warped[0] * 11.0, warped[1] * 11.0, 3, 2.0, 0.5);
          const rippleB = ridgeFbm2(warped[0] * 18.0 + 4.0, warped[1] * 18.0 - 3.0, 2, 2.0, 0.55);
          const grain = fbm2(u * 18.0 + 5.0, v * 18.0 - 2.0, 3, 2.0, 0.54);
          const shell = smoothBand(fbm2(u * 20.0 - 10.0, v * 20.0 + 6.0, 2, 2.2, 0.5), 0.78, 0.96);
          const ripple = rippleA * 0.6 + rippleB * 0.4;
          const r = 188 + grain * 26 + ripple * 12 + shell * 14;
          const g = 170 + grain * 18 + ripple * 9 + shell * 9;
          const b = 126 + grain * 12 + ripple * 5 + shell * 5;
          return rgba(r, g, b);
        })
      },
      rock: {
        albedo: createLayerTexture(scene, size, (x, y, sizePx) => {
          const u = x / sizePx;
          const v = y / sizePx;
          const warped = warpUv(u, v, 4.2, 0.055);
          const strata = ridgeFbm2(warped[0] * 8.0 + 2.0, warped[1] * 8.0 - 1.0, 3, 2.1, 0.52);
          const body = fbm2(u * 8.0, v * 8.0, 5, 2.15, 0.52);
          const crackField = 1.0 - Math.abs(fbm2(u * 30.0 + 7.0, v * 30.0 - 11.0, 2, 2.0, 0.5) * 2.0 - 1.0);
          const crack = smoothBand(crackField, 0.0, 0.14);
          const lichen = smoothBand(fbm2(u * 11.0 - 9.0, v * 11.0 + 2.0, 3, 2.0, 0.5), 0.62, 0.82);
          const base = 74 + body * 58 + strata * 18;
          const r = base - crack * 24 + lichen * 10;
          const g = base - crack * 20 + lichen * 16;
          const b = base - 8 - crack * 14 + lichen * 6;
          return rgba(r, g, b);
        })
      },
      snow: {
        albedo: createLayerTexture(scene, size, (x, y, sizePx) => {
          const u = x / sizePx;
          const v = y / sizePx;
          const drift = fbm2(u * 5.5, v * 5.5, 4, 2.0, 0.5);
          const compacted = ridgeFbm2(u * 5.0 - 3.0, v * 5.0 + 4.0, 3, 2.0, 0.5);
          const sparkle = smoothBand(fbm2(u * 25.0 + 2.0, v * 25.0 - 5.0, 2, 2.0, 0.5), 0.82, 0.98);
          const shade = 218 + drift * 26 + compacted * 9 + sparkle * 12;
          return rgba(shade, shade + 2, shade + 10);
        })
      }
    };
  }
}

function ensureTerrainBlendShadersRegistered(): void {
  if (Effect.ShadersStore.terrainBlendVertexShader) {
    return;
  }

  Effect.ShadersStore.terrainBlendVertexShader = `
    precision highp float;

    attribute vec3 position;
    attribute vec3 normal;
    attribute vec2 uv;
    attribute vec2 uv2;
    attribute vec2 uv3;
    attribute vec2 uv4;
    attribute vec4 color;

    uniform mat4 world;
    uniform mat4 worldViewProjection;

    varying vec3 vWorldPos;
    varying vec3 vWorldNormal;
    varying vec2 vUV;
    varying vec2 vUv2;
    varying vec2 vUv3;
    varying vec2 vUv4;
    varying vec4 vColor;

    void main(void) {
      vec4 worldPos = world * vec4(position, 1.0);
      vWorldPos = worldPos.xyz;
      vWorldNormal = normalize(mat3(world) * normal);
      vUV = uv;
      vUv2 = uv2;
      vUv3 = uv3;
      vUv4 = uv4;
      vColor = color;
      gl_Position = worldViewProjection * vec4(position, 1.0);
    }
  `;

  Effect.ShadersStore.terrainBlendFragmentShader = `
    precision highp float;

    varying vec3 vWorldPos;
    varying vec3 vWorldNormal;
    varying vec2 vUV;
    varying vec2 vUv2;
    varying vec2 vUv3;
    varying vec2 vUv4;
    varying vec4 vColor;

    uniform sampler2D grassAlbedo;
    uniform sampler2D dirtAlbedo;
    uniform sampler2D sandAlbedo;
    uniform sampler2D rockAlbedo;
    uniform sampler2D snowAlbedo;
    uniform sampler2D roadMask;

    uniform vec3 lightDirection;
    uniform vec3 ambientColor;
    uniform vec3 lightColor;
    uniform float waterLevel;
    uniform float riverBankStrength;
    uniform float riverDischargeStrength;
    uniform float riverMeshThreshold;
    uniform float riverMeshMinWidth;
    uniform vec2 roadMaskWorldMin;
    uniform vec2 roadMaskWorldSize;
    uniform float roadTintStrength;

    uniform float grassScale;
    uniform float dirtScale;
    uniform float sandScale;
    uniform float rockScale;
    uniform float snowScale;
    uniform float macroScale;
    uniform float antiTileStrength;
    uniform float rockSlopeStart;
    uniform float rockSlopeFull;
    uniform float snowStartHeight;
    uniform float snowFullHeight;
    uniform float grassMaxSlope;
    uniform float dirtLowHeight;
    uniform float dirtHighHeight;
    uniform float shorelineStartOffset;
    uniform float shorelineEndOffset;
    uniform float sedimentStrength;
    uniform float sedimentSandBias;
    uniform float smallRiverTintStrength;
    uniform float smallRiverTintBrightness;
    uniform float smallRiverTintSaturation;
    uniform float blendSharpness;
    uniform float triplanarSharpness;
    uniform float normalStrength;
    uniform float heightDebugMax;
    uniform int debugMode;

    float saturate(float value) {
      return clamp(value, 0.0, 1.0);
    }

    vec2 rotate2d(vec2 value, float angle) {
      float s = sin(angle);
      float c = cos(angle);
      return vec2(
        value.x * c - value.y * s,
        value.x * s + value.y * c
      );
    }

    float hash12(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
    }

    vec4 samplePlanarXZ(sampler2D tex, vec3 worldPos, float scale) {
      vec2 baseUv = worldPos.xz * scale;
      vec2 macroCell = floor(worldPos.xz * (scale * 0.18));
      float noiseA = hash12(macroCell + vec2(3.1, 7.9));
      float noiseB = hash12(macroCell + vec2(11.4, 1.7));
      float blend = smoothstep(0.25, 0.75, hash12(macroCell + vec2(5.3, 9.2)));

      vec2 uvA = rotate2d(
        baseUv + vec2(noiseA, noiseB) * (0.73 * antiTileStrength),
        (0.35 + noiseA * 0.55) * antiTileStrength
      );
      vec2 uvB = rotate2d(
        baseUv * (1.0 + 0.07 * antiTileStrength) - vec2(noiseB, noiseA) * (0.61 * antiTileStrength),
        (-0.42 - noiseB * 0.48) * antiTileStrength
      );
      vec4 sampleA = texture2D(tex, uvA);
      vec4 sampleB = texture2D(tex, uvB);
      return mix(sampleA, sampleB, blend * antiTileStrength);
    }

    vec4 sampleTriplanar(sampler2D tex, vec3 worldPos, vec3 worldNormal, float scale, float sharpness) {
      vec3 blend = abs(worldNormal);
      blend = pow(blend, vec3(sharpness));
      blend /= max(blend.x + blend.y + blend.z, 0.0001);

      vec4 xSample = texture2D(tex, worldPos.zy * scale);
      vec4 ySample = texture2D(tex, worldPos.xz * scale);
      vec4 zSample = texture2D(tex, worldPos.xy * scale);

      return xSample * blend.x + ySample * blend.y + zSample * blend.z;
    }

    vec3 triplanarBlend(vec3 worldNormal, float sharpness) {
      vec3 blend = abs(worldNormal);
      blend = pow(blend, vec3(sharpness));
      return blend / max(blend.x + blend.y + blend.z, 0.0001);
    }

    vec3 adjustSaturation(vec3 color, float saturation) {
      float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
      return mix(vec3(luma), color, saturation);
    }

    void main(void) {
      vec3 normalW = normalize(vWorldNormal);
      float slope = 1.0 - saturate(normalW.y);
      float materialSlope = pow(slope, 1.35);
      float height = vWorldPos.y;
      float erosionWear = saturate(vColor.g);
      float sediment = saturate(vColor.b);
      float flow = saturate(vColor.a);
      float river = saturate(vUv2.x);
      float lake = saturate(vUv2.y);
      float coal = saturate(vUv3.x);
      float iron = saturate(vUv3.y);
      float copper = saturate(vUv4.x);
      float channelMask = saturate(flow * 1.15 + erosionWear * 0.35);
      float wetRiver = smoothstep(0.03, 0.28, river);
      float openRiver = smoothstep(0.2, 0.55, river);
      float openLake = smoothstep(0.08, 0.32, lake);
      float inlandWater = max(openRiver, openLake);
      float riverWidthFactor =
        max(0.15, riverBankStrength) * 0.8 +
        riverDischargeStrength * 0.35;
      float riverWidthHint =
        1.5 +
        max(river, flow * 0.9) * 10.5 * riverWidthFactor;
      vec2 roadUv = clamp(
        (vWorldPos.xz - roadMaskWorldMin) / max(roadMaskWorldSize, vec2(0.0001)),
        0.0,
        1.0
      );
      float roadMaskValue = texture2D(roadMask, vec2(roadUv.x, 1.0 - roadUv.y)).r;
      float meshTransition =
        smoothstep(
          max(0.0, riverMeshMinWidth - 1.2),
          riverMeshMinWidth + 1.2,
          riverWidthHint
        ) *
        smoothstep(
          riverMeshThreshold * 0.7,
          riverMeshThreshold + 0.08,
          river
        );
      float narrowDeepRiver =
        (1.0 - smoothstep(riverMeshMinWidth - 0.8, riverMeshMinWidth, riverWidthHint)) *
        smoothstep(0.2, 0.48, river) *
        smoothstep(0.08, 0.22, flow) *
        (1.0 - openLake);
      float rock = smoothstep(rockSlopeStart, rockSlopeFull, materialSlope);
      float snow = smoothstep(snowStartHeight, snowFullHeight, height);
      float grassSlopeFavor = 1.0 - smoothstep(grassMaxSlope * 0.35, grassMaxSlope, materialSlope);
      float grassHeightFavor = 1.0 - smoothstep(snowStartHeight * 0.6, snowStartHeight, height);
      float grass = grassSlopeFavor * grassHeightFavor * (1.0 - rock) * (1.0 - snow);
      float dirtLowlandFavor = 1.0 - smoothstep(dirtLowHeight, dirtHighHeight, height);
      float dirtSlopeFavor = smoothstep(0.08, rockSlopeStart + 0.08, materialSlope) * (1.0 - rock * 0.7);
      float dirt = max(dirtLowlandFavor * 0.8, dirtSlopeFavor * 0.65) * (1.0 - snow) * (1.0 - rock * 0.45);

      float erosionRockFavor = erosionWear * smoothstep(0.12, 0.58, materialSlope);
      rock = max(rock, erosionRockFavor * 0.92);
      dirt += erosionWear * 0.24 + channelMask * 0.18 + wetRiver * 0.28 + openLake * 0.18;
      dirt += sediment * (0.42 * sedimentStrength);
      grass *= 1.0 - saturate(erosionWear * 0.42 + channelMask * 0.55);
      grass *= 1.0 - saturate(sediment * (0.58 * sedimentStrength) + openLake * 0.26);
      snow *= 1.0 - channelMask * 0.08;
      rock *= 1.0 - (wetRiver * 0.1 + openLake * 0.08);
      rock *= 1.0 - sediment * (0.24 * sedimentStrength);

      grass = pow(max(grass, 0.0), blendSharpness);
      dirt = pow(max(dirt, 0.0), blendSharpness);
      rock = pow(max(rock, 0.0), blendSharpness);
      snow = pow(max(snow, 0.0), blendSharpness);

      float sumW = grass + dirt + rock + snow;
      if (sumW < 0.0001) {
        grass = 0.0;
        dirt = 1.0;
        rock = 0.0;
        snow = 0.0;
        sumW = 1.0;
      }

      grass /= sumW;
      dirt /= sumW;
      rock /= sumW;
      snow /= sumW;

      vec2 macroUv = vWorldPos.xz * macroScale;
      float macroNoiseA = texture2D(grassAlbedo, macroUv).r;
      float macroNoiseB = texture2D(dirtAlbedo, macroUv * 1.37 + vec2(17.0, -9.0)).g;
      float macroMask = saturate((macroNoiseA + macroNoiseB) * 0.65);

      vec4 grassCol = samplePlanarXZ(grassAlbedo, vWorldPos, grassScale);
      grassCol.rgb *= mix(vec3(0.82, 0.88, 0.78), vec3(1.12, 1.08, 0.92), macroMask);
      grassCol.rgb *= mix(vec3(1.0), vec3(0.82, 0.9, 0.84), channelMask * 0.45);

      vec4 dirtCol = samplePlanarXZ(dirtAlbedo, vWorldPos, dirtScale);
      dirtCol.rgb *= mix(vec3(0.9, 0.86, 0.8), vec3(1.08, 1.02, 0.94), macroNoiseB);
      dirtCol.rgb *= mix(vec3(0.96, 0.9, 0.82), vec3(0.54, 0.44, 0.34), channelMask * 0.7);
      vec3 smallRiverColor =
        dirtCol.rgb * vec3(0.16, 0.3, 0.56) +
        vec3(0.1, 0.24, 0.38);
      smallRiverColor = adjustSaturation(
        smallRiverColor,
        smallRiverTintSaturation
      ) * smallRiverTintBrightness;
      dirtCol.rgb = mix(
        dirtCol.rgb,
        clamp(smallRiverColor, 0.0, 1.6),
        saturate(narrowDeepRiver * smallRiverTintStrength) * (1.0 - meshTransition)
      );

      vec4 rockCol = sampleTriplanar(rockAlbedo, vWorldPos, normalW, rockScale, triplanarSharpness);
      rockCol.rgb *= mix(vec3(0.86, 0.88, 0.9), vec3(1.06, 1.04, 1.02), macroMask);
      rockCol.rgb *= mix(vec3(0.92, 0.9, 0.88), vec3(1.0, 0.98, 0.95), erosionWear * 0.3);

      vec4 snowCol = samplePlanarXZ(snowAlbedo, vWorldPos, snowScale);
      snowCol.rgb *= mix(vec3(0.92, 0.95, 1.0), vec3(1.02, 1.02, 1.0), macroNoiseA);

      float dryHighland = smoothstep(dirtHighHeight * 0.45, snowStartHeight * 0.9, height) * (1.0 - snow);
      grass = max(grass - dryHighland * 0.18, 0.0);
      dirt = min(dirt + dryHighland * 0.12 + materialSlope * 0.08 * (1.0 - rock), 1.0);

      float shoreHeight = 1.0 - smoothstep(waterLevel + shorelineStartOffset, waterLevel + shorelineEndOffset, height);
      float shoreFlatness = 1.0 - smoothstep(0.08, 0.35, materialSlope);
      float sand = shoreHeight * shoreFlatness * (1.0 - rock) * (1.0 - snow);
      float floodplain =
        sediment *
        sedimentStrength *
        (1.0 - smoothstep(0.14, 0.5, materialSlope)) *
        (1.0 - snow);
      dirt *= (1.0 - sand * 0.7);
      grass *= (1.0 - sand * 0.9);
      dirt += flow * 0.08 * (1.0 - sand);
      dirt += wetRiver * 0.18 + openLake * 0.16;
      dirt += floodplain * 0.24;
      grass *= 1.0 - roadMaskValue * 0.9;
      dirt += roadMaskValue * 0.34;
      sand += roadMaskValue * 0.04;
      grass *= 1.0 - (wetRiver * 0.62 + openLake * 0.82);
      sand *= 1.0 - (wetRiver * 0.38 + openLake * 0.22);
      sand += floodplain * mix(0.08, 0.4, sedimentSandBias) * (0.72 + shoreHeight * 0.55);

      float renormalized = max(grass + dirt + sand + rock + snow, 0.0001);
      grass /= renormalized;
      dirt /= renormalized;
      sand /= renormalized;
      rock /= renormalized;
      snow /= renormalized;

      vec4 sandCol = samplePlanarXZ(sandAlbedo, vWorldPos, sandScale);
      sandCol.rgb *= mix(vec3(0.94, 0.9, 0.82), vec3(1.04, 1.0, 0.92), macroMask);
      sandCol.rgb *= mix(vec3(0.88, 0.82, 0.74), vec3(1.06, 1.02, 0.94), sediment * sedimentStrength);
      vec3 wetTint = mix(vec3(0.0), vec3(0.08, 0.18, 0.22), max(wetRiver, lake * 0.55));
      vec3 openWaterTint = mix(vec3(0.0), vec3(0.08, 0.28, 0.4), inlandWater);

      vec4 finalCol =
        grassCol * grass +
        dirtCol * dirt +
        sandCol * sand +
        rockCol * rock +
        snowCol * snow;
      finalCol.rgb = mix(finalCol.rgb, finalCol.rgb * vec3(0.62, 0.72, 0.78) + wetTint, max(wetRiver, openLake * 0.6) * 0.42);
      finalCol.rgb = mix(finalCol.rgb, finalCol.rgb * vec3(0.34, 0.48, 0.58) + openWaterTint, inlandWater * 0.5);
      float roadBlend =
        saturate(roadMaskValue * roadTintStrength) *
        (1.0 - openLake) *
        (1.0 - smoothstep(0.4, 0.92, snow)) *
        (1.0 - smoothstep(0.45, 0.95, rock));
      vec3 roadColor = mix(vec3(0.36, 0.36, 0.37), vec3(0.54, 0.54, 0.56), macroMask);
      finalCol.rgb = mix(finalCol.rgb, roadColor, roadBlend);
      finalCol.rgb = mix(
        finalCol.rgb,
        finalCol.rgb * vec3(0.48, 0.62, 0.74) + vec3(0.02, 0.08, 0.12),
        meshTransition * 0.18 * (1.0 - openLake)
      );

      if (debugMode == 1) {
        finalCol = vec4(vec3(grass), 1.0);
      } else if (debugMode == 2) {
        finalCol = vec4(vec3(dirt), 1.0);
      } else if (debugMode == 3) {
        finalCol = vec4(vec3(rock), 1.0);
      } else if (debugMode == 4) {
        finalCol = vec4(vec3(snow), 1.0);
      } else if (debugMode == 5) {
        finalCol = vec4(vec3(saturate(height / heightDebugMax)), 1.0);
      } else if (debugMode == 6) {
        finalCol = vec4(vec3(materialSlope), 1.0);
      } else if (debugMode == 7) {
        finalCol = vec4(triplanarBlend(normalW, triplanarSharpness), 1.0);
      } else if (debugMode == 8) {
        finalCol = vec4(mix(vec3(0.03, 0.05, 0.08), vec3(0.98, 0.47, 0.08), vColor.g), 1.0);
      } else if (debugMode == 9) {
        finalCol = vec4(vec3(vColor.r), 1.0);
      } else if (debugMode == 10) {
        finalCol = vec4(mix(vec3(0.02, 0.03, 0.04), vec3(0.18, 0.72, 1.0), vColor.a), 1.0);
      } else if (debugMode == 11) {
        finalCol = vec4(mix(vec3(0.03, 0.02, 0.01), vec3(0.1, 0.62, 1.0), max(river, lake)), 1.0);
      } else if (debugMode == 12) {
        finalCol = vec4(mix(vec3(0.04, 0.03, 0.02), vec3(0.16, 0.66, 1.0), lake), 1.0);
      } else if (debugMode == 13) {
        finalCol = vec4(mix(vec3(0.04, 0.03, 0.02), vec3(0.94, 0.82, 0.46), sediment), 1.0);
      } else if (debugMode == 14) {
        finalCol = vec4(vec3(saturate(riverWidthHint / max(riverMeshMinWidth * 2.0, 1.0))), 1.0);
      } else if (debugMode == 15) {
        finalCol = vec4(
          mix(
            vec3(0.05, 0.05, 0.06),
            vec3(0.08, 0.72, 1.0),
            meshTransition
          ),
          1.0
        );
      } else if (debugMode == 16) {
        vec3 resourceColor =
          vec3(0.18, 0.18, 0.2) * coal +
          vec3(0.76, 0.4, 0.24) * iron +
          vec3(0.2, 0.7, 0.56) * copper;
        float resourceStrength = max(max(coal, iron), copper);
        finalCol = vec4(
          mix(vec3(0.05, 0.05, 0.06), resourceColor, resourceStrength),
          1.0
        );
      } else if (debugMode == 17) {
        finalCol = vec4(mix(vec3(0.05, 0.05, 0.06), vec3(0.62, 0.64, 0.7), coal), 1.0);
      } else if (debugMode == 18) {
        finalCol = vec4(mix(vec3(0.05, 0.05, 0.06), vec3(0.82, 0.46, 0.28), iron), 1.0);
      } else if (debugMode == 19) {
        finalCol = vec4(mix(vec3(0.05, 0.05, 0.06), vec3(0.24, 0.74, 0.6), copper), 1.0);
      } else {
        float diffuse = max(dot(normalW, normalize(lightDirection)), 0.0);
        float wrappedDiffuse = diffuse * 0.75 + 0.25;
        finalCol.rgb *= ambientColor + lightColor * wrappedDiffuse * normalStrength;
      }

      gl_FragColor = vec4(finalCol.rgb, 1.0);
    }
  `;
}

function createLayerTexture(
  scene: Scene,
  size: number,
  pixel: (x: number, y: number, size: number) => [number, number, number, number]
): Texture {
  const data = new Uint8Array(size * size * 4);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = (y * size + x) * 4;
      const [r, g, b, a] = pixel(x, y, size);
      data[index] = r;
      data[index + 1] = g;
      data[index + 2] = b;
      data[index + 3] = a;
    }
  }

  const texture = RawTexture.CreateRGBATexture(
    data,
    size,
    size,
    scene,
    true,
    false,
    Texture.TRILINEAR_SAMPLINGMODE
  );
  texture.wrapU = Texture.WRAP_ADDRESSMODE;
  texture.wrapV = Texture.WRAP_ADDRESSMODE;
  return texture;
}

function createBlackMaskTexture(scene: Scene): Texture {
  const data = new Uint8Array([0, 0, 0, 255]);
  const texture = RawTexture.CreateRGBATexture(
    data,
    1,
    1,
    scene,
    false,
    false,
    Texture.NEAREST_SAMPLINGMODE
  );
  texture.wrapU = Texture.CLAMP_ADDRESSMODE;
  texture.wrapV = Texture.CLAMP_ADDRESSMODE;
  return texture;
}

function createFileTexture(
  scene: Scene,
  url: string,
  maxTextureSize: number
): Texture {
  const texture = new Texture(
    url,
    scene,
    true,
    false,
    Texture.TRILINEAR_SAMPLINGMODE
  );
  texture.wrapU = Texture.WRAP_ADDRESSMODE;
  texture.wrapV = Texture.WRAP_ADDRESSMODE;
  downscaleTextureOnLoad(texture, url, maxTextureSize);
  return texture;
}

function downscaleTextureOnLoad(
  texture: Texture,
  url: string,
  maxTextureSize: number
): void {
  if (
    typeof window === "undefined" ||
    typeof document === "undefined" ||
    maxTextureSize <= 0
  ) {
    return;
  }

  texture.onLoadObservable.addOnce(() => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      const largestDimension = Math.max(image.width, image.height);
      if (largestDimension <= maxTextureSize) {
        return;
      }

      const scale = maxTextureSize / largestDimension;
      const width = Math.max(1, Math.round(image.width * scale));
      const height = Math.max(1, Math.round(image.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) {
        return;
      }

      context.drawImage(image, 0, 0, width, height);
      texture.updateURL(url, canvas.toDataURL("image/png"));
    };
    image.src = url;
  });
}

function rgba(r: number, g: number, b: number, a = 255): [number, number, number, number] {
  return [clampByte(r), clampByte(g), clampByte(b), clampByte(a)];
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - edge0) / Math.max(edge1 - edge0, 0.0001)));
  return t * t * (3 - 2 * t);
}

function smoothBand(value: number, start: number, end: number): number {
  return smoothstep(start, end, value);
}

function fbm2(
  x: number,
  y: number,
  octaves: number,
  lacunarity: number,
  gain: number
): number {
  let total = 0;
  let amplitude = 1;
  let frequency = 1;
  let amplitudeSum = 0;

  for (let octave = 0; octave < octaves; octave += 1) {
    total += valueNoise2(x * frequency, y * frequency) * amplitude;
    amplitudeSum += amplitude;
    amplitude *= gain;
    frequency *= lacunarity;
  }

  return total / Math.max(amplitudeSum, 0.0001);
}

function ridgeFbm2(
  x: number,
  y: number,
  octaves: number,
  lacunarity: number,
  gain: number
): number {
  let total = 0;
  let amplitude = 1;
  let frequency = 1;
  let amplitudeSum = 0;

  for (let octave = 0; octave < octaves; octave += 1) {
    const noise = valueNoise2(x * frequency, y * frequency);
    total += (1 - Math.abs(noise * 2 - 1)) * amplitude;
    amplitudeSum += amplitude;
    amplitude *= gain;
    frequency *= lacunarity;
  }

  return total / Math.max(amplitudeSum, 0.0001);
}

function warpUv(u: number, v: number, frequency: number, strength: number): [number, number] {
  const offsetX = (fbm2(u * frequency + 13.1, v * frequency - 7.2, 2, 2.0, 0.5) - 0.5) * strength;
  const offsetY = (fbm2(u * frequency - 5.4, v * frequency + 9.8, 2, 2.0, 0.5) - 0.5) * strength;
  return [u + offsetX, v + offsetY];
}

function valueNoise2(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = smoothstep(0, 1, fx);
  const sy = smoothstep(0, 1, fy);

  const n00 = hash2(ix, iy);
  const n10 = hash2(ix + 1, iy);
  const n01 = hash2(ix, iy + 1);
  const n11 = hash2(ix + 1, iy + 1);

  const nx0 = n00 + (n10 - n00) * sx;
  const nx1 = n01 + (n11 - n01) * sx;
  return nx0 + (nx1 - nx0) * sy;
}

function hash2(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}
