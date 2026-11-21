/**
 * 行星：
 * - PBR 程序化纹理球体作为默认外观，支持 GLB 模型热替换；
 * - 可选行星环（土星），环随自转轴倾斜；
 * - 自带的卫星节点挂载在 orbitNode 下，随行星层级运动；
 * - 提供轨道线引用，由仿真层统一开关。
 */
import * as THREE from 'three';
import { OrbitalBody } from './OrbitalBody';
import { Moon } from './Moon';
import { OrbitLine } from '../orbitLine';
import type { BodyConfig } from '../types';
import {
  createPlanetMaterial,
  createFallbackSphere,
  createRingMaterial
} from '../materials';
import { modelLoader } from '../modelLoader';

export class Planet extends OrbitalBody {
  readonly config: BodyConfig;
  readonly moons: Moon[] = [];
  readonly orbitLine: OrbitLine;
  private readonly fallbackMesh: THREE.Mesh;
  private ring: THREE.Mesh | null = null;

  constructor(config: BodyConfig) {
    super({
      id: config.id,
      name: config.name,
      typeLabel: '行星',
      orbitRadius: config.orbitRadius,
      eccentricity: config.eccentricity,
      orbitSpeed: config.orbitSpeed,
      spinSpeed: config.spinSpeed,
      initialAngle: config.initialAngle,
      inclination: config.inclination,
      axialTilt: config.axialTilt,
      radius: config.radius
    });
    this.config = config;

    // 程序化兜底 PBR 球体
    const isGasGiant = config.texture.style === 'gas' || config.texture.style === 'ice';
    const material = createPlanetMaterial({
      texture: config.texture,
      roughness: isGasGiant ? 0.7 : 0.9,
      metalness: 0.04
    });
    this.fallbackMesh = createFallbackSphere(config.radius, material);
    this.replaceMesh(this.fallbackMesh);

    // 行星环（若配置）：挂到 spinNode，随轴倾角倾斜
    if (config.ring) {
      const ringGeometry = new THREE.RingGeometry(
        config.ring.innerRadius,
        config.ring.outerRadius,
        96
      );
      // UV 重映射到 0~1，使环纹理沿径向展开
      const pos = ringGeometry.attributes.position;
      const uv = ringGeometry.attributes.uv;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        const r = Math.sqrt(x * x + y * y);
        const t =
          (r - config.ring.innerRadius) /
          (config.ring.outerRadius - config.ring.innerRadius);
        uv.setXY(i, t, 0.5);
      }
      const ringMaterial = createRingMaterial(
        config.ring.innerRadius,
        config.ring.outerRadius,
        config.ring.color
      );
      this.ring = new THREE.Mesh(ringGeometry, ringMaterial);
      this.ring.rotation.x = Math.PI / 2; // RingGeometry 默认在 XY 平面，转到 XZ
      this.ring.receiveShadow = true;
      this.spinNode.add(this.ring);
    }

    // 卫星：挂到行星 orbitNode，跟随行星公转
    for (const moonCfg of config.moons ?? []) {
      const moon = new Moon(moonCfg);
      this.moons.push(moon);
      this.orbitNode.add(moon.tiltNode);
    }

    // 行星轨道线（半透明）
    this.orbitLine = new OrbitLine(
      config.orbitRadius,
      config.eccentricity,
      config.inclination
    );
  }

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

  /** 外部在构造完成后调用，触发可选模型加载 */
  initModelLoading(): void {
    this.queueModel();
  }

  /** 帧更新：行星自身 + 全部卫星 */
  override update(deltaSeconds: number, timeScale: number): void {
    super.update(deltaSeconds, timeScale);
    for (const moon of this.moons) {
      moon.update(deltaSeconds, timeScale);
    }
  }

  override reset(): void {
    super.reset();
    for (const moon of this.moons) {
      moon.reset();
    }
  }

  setOrbitLineVisible(visible: boolean): void {
    this.orbitLine.setVisible(visible);
  }
}
