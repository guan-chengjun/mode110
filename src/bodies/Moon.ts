/**
 * 卫星（月球）：
 * 围绕母行星公转，节点挂载在行星的 orbitNode 下，
 * 因此卫星会随行星一同绕太阳运动（层级坐标天然正确）。
 */
import * as THREE from 'three';
import { OrbitalBody } from './OrbitalBody';
import type { MoonConfig } from '../types';
import { createPlanetMaterial, createFallbackSphere } from '../materials';
import { modelLoader } from '../modelLoader';

export class Moon extends OrbitalBody {
  private readonly config: MoonConfig;
  private readonly fallbackMesh: THREE.Mesh;

  constructor(config: MoonConfig) {
    super({
      id: config.id,
      name: config.name,
      typeLabel: '卫星',
      orbitRadius: config.orbitRadius,
      eccentricity: 0, // 卫星轨道近似正圆
      orbitSpeed: config.orbitSpeed,
      spinSpeed: config.spinSpeed,
      initialAngle: config.initialAngle,
      inclination: config.inclination,
      axialTilt: 0,
      radius: config.radius
    });
    this.config = config;

    // 程序化兜底球体
    const material = createPlanetMaterial({
      texture: config.texture,
      roughness: 0.95,
      metalness: 0.02
    });
    this.fallbackMesh = createFallbackSphere(config.radius, material);
    this.replaceMesh(this.fallbackMesh);

    this.queueModel();
  }

  /** GLB 加载成功则替换兜底球体，失败自动保留球体 */
  private queueModel(): void {
    if (!this.config.modelUrl) return;
    modelLoader.enqueue({
      url: this.config.modelUrl,
      label: this.name,
      targetRadius: this.config.radius,
      onLoaded: (model) => this.replaceMesh(model),
      onFallback: () => this.replaceMesh(this.fallbackMesh)
    });
  }
}
