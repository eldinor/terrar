import { Effect } from "@babylonjs/core/Materials/effect";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Scene } from "@babylonjs/core/scene";
import {
  cloneTerrainMaterialConfig,
  DEFAULT_TERRAIN_MATERIAL_CONFIG,
  TerrainMaterialConfig
} from "./TerrainMaterialConfig";
import { TerrainDebugViewMode } from "./TerrainMaterialDebug";
import { TerrainTextureSet } from "./TerrainTextureSet";

export class TerrainMaterialFactory {
  static createTerrainMaterial(
    scene: Scene,
    textures: TerrainTextureSet = this.createDefaultTextureSet(scene),
    config: TerrainMaterialConfig = DEFAULT_TERRAIN_MATERIAL_CONFIG
  ): ShaderMaterial {
    ensureTerrainBlendShadersRegistered();

    const material = new ShaderMaterial("terrain-material", scene, "terrainBlend", {
      attributes: ["position", "normal", "uv"],
      uniforms: [
        "world",
        "worldViewProjection",
        "lightDirection",
        "ambientColor",
        "lightColor",
        "waterLevel",
        "grassScale",
        "dirtScale",
        "sandScale",
        "rockScale",
        "snowScale",
        "macroScale",
        "rockSlopeStart",
        "rockSlopeFull",
        "snowStartHeight",
        "snowFullHeight",
        "grassMaxSlope",
        "dirtLowHeight",
        "dirtHighHeight",
        "shorelineStartOffset",
        "shorelineEndOffset",
        "blendSharpness",
        "triplanarSharpness",
        "normalStrength",
        "debugMode",
        "heightDebugMax"
      ],
      samplers: ["grassAlbedo", "dirtAlbedo", "sandAlbedo", "rockAlbedo", "snowAlbedo"]
    });

    material.backFaceCulling = false;
    material.setTexture("grassAlbedo", textures.grass.albedo);
    material.setTexture("dirtAlbedo", textures.dirt.albedo);
    material.setTexture("sandAlbedo", textures.sand.albedo);
    material.setTexture("rockAlbedo", textures.rock.albedo);
    material.setTexture("snowAlbedo", textures.snow.albedo);
    material.setVector3(
      "lightDirection",
      new Vector3(-0.45, 0.9, 0.3).normalize()
    );
    material.setColor3("ambientColor", new Color3(0.4, 0.43, 0.48));
    material.setColor3("lightColor", new Color3(1, 0.97, 0.92));
    material.setFloat("waterLevel", 0);

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
    material.setFloat("rockSlopeStart", thresholds.rockSlopeStart);
    material.setFloat("rockSlopeFull", thresholds.rockSlopeFull);
    material.setFloat("snowStartHeight", thresholds.snowStartHeight);
    material.setFloat("snowFullHeight", thresholds.snowFullHeight);
    material.setFloat("grassMaxSlope", thresholds.grassMaxSlope);
    material.setFloat("dirtLowHeight", thresholds.dirtLowHeight);
    material.setFloat("dirtHighHeight", thresholds.dirtHighHeight);
    material.setFloat("shorelineStartOffset", config.shorelineStartOffset);
    material.setFloat("shorelineEndOffset", config.shorelineEndOffset);
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

  private static createDefaultTextureSet(scene: Scene): TerrainTextureSet {
    return {
      grass: {
        albedo: createLayerTexture(scene, 64, (x, y) => {
          const stripe = ((x * 3 + y * 5) % 17) / 16;
          const r = 54 + stripe * 12;
          const g = 104 + stripe * 40;
          const b = 46 + stripe * 10;
          return [r, g, b, 255];
        })
      },
      dirt: {
        albedo: createLayerTexture(scene, 64, (x, y) => {
          const grain = ((x * 11 + y * 7) % 23) / 22;
          const r = 110 + grain * 28;
          const g = 88 + grain * 18;
          const b = 60 + grain * 12;
          return [r, g, b, 255];
        })
      },
      sand: {
        albedo: createLayerTexture(scene, 64, (x, y) => {
          const grain = ((x * 5 + y * 9) % 19) / 18;
          const ripple = Math.sin(x * 0.55) * Math.cos(y * 0.45) * 0.5 + 0.5;
          const r = Math.floor(188 + grain * 28 + ripple * 10);
          const g = Math.floor(168 + grain * 20 + ripple * 8);
          const b = Math.floor(122 + grain * 16 + ripple * 4);
          return [r, g, b, 255];
        })
      },
      rock: {
        albedo: createLayerTexture(scene, 64, (x, y) => {
          const ridge = Math.sin((x + y) * 0.65) * 0.5 + 0.5;
          const crack = ((x * 13 + y * 17) % 29) / 28;
          const shade = Math.floor(90 + ridge * 55 + crack * 18);
          return [shade, shade, Math.max(70, shade - 8), 255];
        })
      },
      snow: {
        albedo: createLayerTexture(scene, 64, (x, y) => {
          const sparkle = ((x * 19 + y * 23) % 31) / 30;
          const shade = Math.floor(222 + sparkle * 28);
          return [shade, shade, 255, 255];
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

    uniform mat4 world;
    uniform mat4 worldViewProjection;

    varying vec3 vWorldPos;
    varying vec3 vWorldNormal;
    varying vec2 vUV;

    void main(void) {
      vec4 worldPos = world * vec4(position, 1.0);
      vWorldPos = worldPos.xyz;
      vWorldNormal = normalize(mat3(world) * normal);
      vUV = uv;
      gl_Position = worldViewProjection * vec4(position, 1.0);
    }
  `;

  Effect.ShadersStore.terrainBlendFragmentShader = `
    precision highp float;

    varying vec3 vWorldPos;
    varying vec3 vWorldNormal;
    varying vec2 vUV;

    uniform sampler2D grassAlbedo;
    uniform sampler2D dirtAlbedo;
    uniform sampler2D sandAlbedo;
    uniform sampler2D rockAlbedo;
    uniform sampler2D snowAlbedo;

    uniform vec3 lightDirection;
    uniform vec3 ambientColor;
    uniform vec3 lightColor;
    uniform float waterLevel;

    uniform float grassScale;
    uniform float dirtScale;
    uniform float sandScale;
    uniform float rockScale;
    uniform float snowScale;
    uniform float macroScale;
    uniform float rockSlopeStart;
    uniform float rockSlopeFull;
    uniform float snowStartHeight;
    uniform float snowFullHeight;
    uniform float grassMaxSlope;
    uniform float dirtLowHeight;
    uniform float dirtHighHeight;
    uniform float shorelineStartOffset;
    uniform float shorelineEndOffset;
    uniform float blendSharpness;
    uniform float triplanarSharpness;
    uniform float normalStrength;
    uniform float heightDebugMax;
    uniform int debugMode;

    float saturate(float value) {
      return clamp(value, 0.0, 1.0);
    }

    vec4 samplePlanarXZ(sampler2D tex, vec3 worldPos, float scale) {
      return texture2D(tex, worldPos.xz * scale);
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

    void main(void) {
      vec3 normalW = normalize(vWorldNormal);
      float slope = 1.0 - saturate(normalW.y);
      float materialSlope = pow(slope, 1.35);
      float height = vWorldPos.y;
      float rock = smoothstep(rockSlopeStart, rockSlopeFull, materialSlope);
      float snow = smoothstep(snowStartHeight, snowFullHeight, height);
      float grassSlopeFavor = 1.0 - smoothstep(grassMaxSlope * 0.35, grassMaxSlope, materialSlope);
      float grassHeightFavor = 1.0 - smoothstep(snowStartHeight * 0.6, snowStartHeight, height);
      float grass = grassSlopeFavor * grassHeightFavor * (1.0 - rock) * (1.0 - snow);
      float dirtLowlandFavor = 1.0 - smoothstep(dirtLowHeight, dirtHighHeight, height);
      float dirtSlopeFavor = smoothstep(0.08, rockSlopeStart + 0.08, materialSlope) * (1.0 - rock * 0.7);
      float dirt = max(dirtLowlandFavor * 0.8, dirtSlopeFavor * 0.65) * (1.0 - snow) * (1.0 - rock * 0.45);

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

      vec4 dirtCol = samplePlanarXZ(dirtAlbedo, vWorldPos, dirtScale);
      dirtCol.rgb *= mix(vec3(0.9, 0.86, 0.8), vec3(1.08, 1.02, 0.94), macroNoiseB);

      vec4 rockCol = sampleTriplanar(rockAlbedo, vWorldPos, normalW, rockScale, triplanarSharpness);
      rockCol.rgb *= mix(vec3(0.86, 0.88, 0.9), vec3(1.06, 1.04, 1.02), macroMask);

      vec4 snowCol = samplePlanarXZ(snowAlbedo, vWorldPos, snowScale);
      snowCol.rgb *= mix(vec3(0.92, 0.95, 1.0), vec3(1.02, 1.02, 1.0), macroNoiseA);

      float dryHighland = smoothstep(dirtHighHeight * 0.45, snowStartHeight * 0.9, height) * (1.0 - snow);
      grass = max(grass - dryHighland * 0.18, 0.0);
      dirt = min(dirt + dryHighland * 0.12 + materialSlope * 0.08 * (1.0 - rock), 1.0);

      float shoreHeight = 1.0 - smoothstep(waterLevel + shorelineStartOffset, waterLevel + shorelineEndOffset, height);
      float shoreFlatness = 1.0 - smoothstep(0.08, 0.35, materialSlope);
      float sand = shoreHeight * shoreFlatness * (1.0 - rock) * (1.0 - snow);
      dirt *= (1.0 - sand * 0.7);
      grass *= (1.0 - sand * 0.9);

      float renormalized = max(grass + dirt + sand + rock + snow, 0.0001);
      grass /= renormalized;
      dirt /= renormalized;
      sand /= renormalized;
      rock /= renormalized;
      snow /= renormalized;

      vec4 sandCol = samplePlanarXZ(sandAlbedo, vWorldPos, sandScale);
      sandCol.rgb *= mix(vec3(0.94, 0.9, 0.82), vec3(1.04, 1.0, 0.92), macroMask);

      vec4 finalCol =
        grassCol * grass +
        dirtCol * dirt +
        sandCol * sand +
        rockCol * rock +
        snowCol * snow;

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
  pixel: (x: number, y: number) => [number, number, number, number]
): Texture {
  const data = new Uint8Array(size * size * 4);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = (y * size + x) * 4;
      const [r, g, b, a] = pixel(x, y);
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
