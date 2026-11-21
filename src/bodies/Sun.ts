/**
 * 太阳：
 * - MeshBasicMaterial 自发光表面 + Additive 辉光 Sprite；
 * - 同时是场景主光源（PointLight，开启阴影），位于世界原点；
 * - 无公转，仅缓慢自转。
 */
import * as THREE from 'three';
import type { BodyInfo, Selectable } from '../types';
import { createSunMaterial, createFallbackSphere } from '../materials';
import { createGlowTexture } from '../textures';
import type { TextureConfig } from '../types';
import { modelLoader } from '../modelLoader';
import { DEG2RAD } from '../utils/math';

export class Sun implements Selectable {
  readonly id = 'sun';
  readonly name = '太阳';
  readonly typeLabel = '恒星（自发光光源）';

  readonly object3d: THREE.Object3D;
  readonly light: THREE.PointLight;
  private readonly mesh: THREE.Mesh;
  private readonly glow: THREE.Sprite;
  private readonly _radius: number;
  private readonly spinSpeed: number;
  private readonly textureCfg: TextureConfig;
  private readonly modelUrl?: string;

  constructor(radius: number, spinSpeed: number, textureCfg: TextureConfig, modelUrl?: string) {
    this._radius = radius;
    this.spinSpeed = spinSpeed;
    this.textureCfg = textureCfg;
    this.modelUrl = modelUrl;

    this.object3d = new THREE.Object3D();
    // 拾取代理标记（同 OrbitalBody），模型替换后递归拾取依然有效
    this.object3d.userData.selectable = this;

    // 自发光球体
    const material = createSunMaterial(textureCfg);
    this.mesh = createFallbackSphere(radius, material);
    this.mesh.castShadow = false; // 光源自身不投影
    this.object3d.add(this.mesh);

    // 辉光：径向渐变精灵，尺寸约为球体 3.2 倍
    const glowTexture = createGlowTexture(0xffdd88, 0xff7722);
    const glowMaterial = new THREE.SpriteMaterial({
      map: glowTexture,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
      toneMapped: false
    });
    this.glow = new THREE.Sprite(glowMaterial);
    this.glow.scale.setScalar(radius * 3.4);
    this.object3d.add(this.glow);

    // 场景主光源：颜色偏暖，强度覆盖至外层行星
    this.light = new THREE.PointLight(0xfff2d8, 900, 0, 1.6);
    this.light.castShadow = true;
    this.light.shadow.mapSize.set(1024, 1024);
    this.light.shadow.bias = -0.0008;
    this.object3d.add(this.light);

    this.queueModel();
  }

  /** 可选 GLB 替换（如高精度太阳模型），失败保留程序化球体 */
  private queueModel(): void {
    if (!this.modelUrl) return;
    modelLoader.enqueue({
      url: this.modelUrl,
      label: this.name,
      targetRadius: this.radius,
      onLoaded: (model) => {
        this.object3d.remove(this.mesh);
        this.object3d.add(model);
      },
      onFallback: () => {
        /* 保留初始程序化球体，无需处理 */
      }
    });
  }

  update(deltaSeconds: number, timeScale: number): void {
    if (timeScale === 0) return;
    this.mesh.rotateY(this.spinSpeed * deltaSeconds * timeScale * DEG2RAD);
  }

  reset(): void {
    this.mesh.rotation.set(0, 0, 0);
  }

  getBodyInfo(): BodyInfo {
    return {
      id: this.id,
      name: this.name,
      typeLabel: this.typeLabel,
      orbitSpeed: 0,
      spinSpeed: this.spinSpeed
    };
  }

  getOrbitSpeed(): number {
    return 0;
  }

  getDistanceToSun(): number {
    return 0;
  }

  getPickMesh(): THREE.Object3D {
    return this.mesh;
  }

  get radius(): number {
    return this._radius;
  }
}
