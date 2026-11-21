/**
 * PBR 材质工厂。
 * 行星统一使用 MeshStandardMaterial（物理工作流：基础色贴图 + 粗糙度 + 金属度），
 * 太阳使用自发光 MeshBasicMaterial（不受光照影响，配合 Bloom 呈现发光体）。
 */
import * as THREE from 'three';
import type { TextureConfig } from './types';
import { createProceduralTexture, createRingTexture } from './textures';

export interface PlanetMaterialOptions {
  texture: TextureConfig;
  /** 粗糙度：岩石高、气态行星中等 */
  roughness?: number;
  metalness?: number;
}

/** 创建行星 / 卫星标准 PBR 材质（程序化纹理兜底外观） */
export function createPlanetMaterial(options: PlanetMaterialOptions): THREE.MeshStandardMaterial {
  const map = createProceduralTexture(options.texture);
  return new THREE.MeshStandardMaterial({
    map,
    roughness: options.roughness ?? 0.85,
    metalness: options.metalness ?? 0.05
  });
}

/** 太阳自发光材质：emissiveMap 驱动辉光颜色，配合 UnrealBloom 泛光 */
export function createSunMaterial(textureCfg: TextureConfig): THREE.MeshBasicMaterial {
  const map = createProceduralTexture(textureCfg);
  return new THREE.MeshBasicMaterial({
    map,
    // Basic 材质不受灯光影响，本身即自发光观感
    toneMapped: false // 保持高亮不被色调映射压暗，Bloom 阈值才能稳定识别
  });
}

/** 彗星核材质：偏暗的脏雪球，低金属度高粗糙 */
export function createCometMaterial(textureCfg: TextureConfig): THREE.MeshStandardMaterial {
  const map = createProceduralTexture(textureCfg);
  return new THREE.MeshStandardMaterial({
    map,
    roughness: 0.95,
    metalness: 0.0
  });
}

/** 行星环材质（双面、半透明） */
export function createRingMaterial(
  innerRadius: number,
  outerRadius: number,
  color: number
): THREE.MeshBasicMaterial {
  const texture = createRingTexture(color);
  return new THREE.MeshBasicMaterial({
    map: texture,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.9,
    depthWrite: false
  });
}

/** 程序化兜底球体：所有天体共享 64 段经纬球，兼顾平滑度与性能 */
export function createFallbackSphere(
  radius: number,
  material: THREE.Material
): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(radius, 64, 48);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
