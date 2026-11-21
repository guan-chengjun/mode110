/**
 * 彗星：
 * - 狭长椭圆轨道（高偏心率），在内太阳系快速掠过、外太阳系缓慢回归；
 * - 彗核 + 彗发辉光 Sprite；
 * - 拖尾用 THREE.Points 实现：记录最近 N 个历史位置，
 *   越靠后的点越暗越小；靠近太阳时整体更长更亮（太阳辐射增强的视觉近似）；
 * - 拖尾方向取「位置历史连线」，天然背向运动方向；
 *   后续可替换为严格的「日心反方向」离子尾（见 README 扩展说明）。
 */
import * as THREE from 'three';
import { OrbitalBody } from './OrbitalBody';
import { OrbitLine } from '../orbitLine';
import type { CometConfig } from '../types';
import { createCometMaterial, createFallbackSphere } from '../materials';
import { createGlowTexture } from '../textures';
import { modelLoader } from '../modelLoader';

interface TrailPoint {
  position: THREE.Vector3;
}

export class Comet extends OrbitalBody {
  readonly config: CometConfig;
  readonly orbitLine: OrbitLine;

  private readonly fallbackMesh: THREE.Mesh;
  private readonly coma: THREE.Sprite;
  private readonly trail: THREE.Points;
  private readonly trailGeometry: THREE.BufferGeometry;
  private readonly trailPositions: Float32Array;
  private readonly trailColors: Float32Array;
  private readonly history: TrailPoint[] = [];

  /** 拖尾整体可见性开关（控制面板的「彗星效果」） */
  private effectVisible = true;

  constructor(config: CometConfig) {
    super({
      id: config.id,
      name: config.name,
      typeLabel: '彗星',
      orbitRadius: config.orbitRadius,
      eccentricity: config.eccentricity,
      orbitSpeed: config.orbitSpeed,
      spinSpeed: config.spinSpeed,
      initialAngle: config.initialAngle,
      inclination: config.inclination,
      axialTilt: 0,
      radius: config.radius
    });
    this.config = config;

    // 彗核（脏雪球程序化球体，可被 GLB 替换）
    const material = createCometMaterial(config.texture);
    this.fallbackMesh = createFallbackSphere(config.radius, material);
    this.replaceMesh(this.fallbackMesh);

    // 彗发辉光
    const glowTexture = createGlowTexture(0xcfe8ff, 0x4a7dff);
    const comaMaterial = new THREE.SpriteMaterial({
      map: glowTexture,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
      opacity: 0.85
    });
    this.coma = new THREE.Sprite(comaMaterial);
    this.coma.scale.setScalar(config.radius * 6);
    this.spinNode.add(this.coma);

    // 拖尾 Points 缓冲
    const max = config.maxTrail;
    this.trailPositions = new Float32Array(max * 3);
    this.trailColors = new Float32Array(max * 3);
    this.trailGeometry = new THREE.BufferGeometry();
    this.trailGeometry.setAttribute('position', new THREE.BufferAttribute(this.trailPositions, 3));
    this.trailGeometry.setAttribute('color', new THREE.BufferAttribute(this.trailColors, 3));
    this.trailGeometry.setDrawRange(0, 0);

    const trailMaterial = new THREE.PointsMaterial({
      size: config.radius * 1.6,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true
    });
    this.trail = new THREE.Points(this.trailGeometry, trailMaterial);
    this.trail.frustumCulled = false;

    // 彗星轨道线（狭长椭圆，颜色偏青白）
    this.orbitLine = new OrbitLine(
      config.orbitRadius,
      config.eccentricity,
      config.inclination,
      0x8fd8ff
    );

    this.queueModel();
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

  /** 拖尾节点需要挂到场景（使用世界坐标记录），由仿真层调用 */
  getTrailObject(): THREE.Points {
    return this.trail;
  }

  /** 彗星效果（彗核 / 彗发 / 拖尾 / 轨道）当前是否可见 */
  get effectEnabled(): boolean {
    return this.effectVisible;
  }

  setEffectVisible(visible: boolean): void {
    this.effectVisible = visible;
    this.tiltNode.visible = visible; // 彗核与彗发
    this.trail.visible = visible;
    this.orbitLine.setVisible(visible);
    if (visible) this.clearTrail(); // 重新显示时清空陈旧拖尾
  }

  /** 清空拖尾历史（重置 / 重新启用时调用） */
  clearTrail(): void {
    this.history.length = 0;
    this.trailGeometry.setDrawRange(0, 0);
  }

  override reset(): void {
    super.reset();
    this.clearTrail();
  }

  override update(deltaSeconds: number, timeScale: number): void {
    if (!this.effectVisible) return;
    super.update(deltaSeconds, timeScale);
    if (timeScale === 0) return;

    // 记录当前世界位置作为拖尾采样点
    const worldPos = new THREE.Vector3();
    this.spinNode.getWorldPosition(worldPos);
    this.history.push({ position: worldPos.clone() });
    if (this.history.length > this.config.maxTrail) {
      this.history.shift();
    }

    // 距太阳越近，拖尾有效长度越长、彗发越亮
    const distance = worldPos.length();
    // 以 25 单位为「活跃区」，归一化到 0~1
    const proximity = THREE.MathUtils.clamp(1 - distance / 25, 0, 1);
    const activeLength = Math.max(
      8,
      Math.floor(THREE.MathUtils.lerp(this.config.maxTrail * 0.25, this.config.maxTrail, proximity))
    );
    const visibleHistory = this.history.slice(-activeLength);

    (this.coma.material as THREE.SpriteMaterial).opacity = 0.45 + proximity * 0.5;
    this.coma.scale.setScalar(this.config.radius * (4 + proximity * 5));

    const count = visibleHistory.length;
    const headColor = new THREE.Color(0xdff2ff);
    const tailColor = new THREE.Color(0x2a55cc);
    const tmpColor = new THREE.Color();

    for (let i = 0; i < count; i++) {
      const p = visibleHistory[i].position;
      this.trailPositions[i * 3] = p.x;
      this.trailPositions[i * 3 + 1] = p.y;
      this.trailPositions[i * 3 + 2] = p.z;

      // 头部亮白 -> 尾部深蓝透明
      const t = count === 1 ? 1 : i / (count - 1);
      tmpColor.copy(tailColor).lerp(headColor, t);
      const brightness = 0.35 + proximity * 0.65;
      this.trailColors[i * 3] = tmpColor.r * brightness;
      this.trailColors[i * 3 + 1] = tmpColor.g * brightness;
      this.trailColors[i * 3 + 2] = tmpColor.b * brightness;
    }

    this.trailGeometry.setDrawRange(0, count);
    (this.trailGeometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.trailGeometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;
  }
}
