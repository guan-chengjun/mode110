/**
 * 星空背景：
 * 在半径很大的球壳内表面散布随机亮度的白色点精灵，
 * 使用 BackSide 渲染，相机移动时产生稳定的远景视差。
 */
import * as THREE from 'three';
import { createRng } from './utils/math';

const STAR_COUNT = 4500;
const STARFIELD_RADIUS = 600;

export class Starfield {
  readonly object3d: THREE.Points;

  constructor() {
    const rng = createRng(20261122);
    const positions = new Float32Array(STAR_COUNT * 3);
    const colors = new Float32Array(STAR_COUNT * 3);

    for (let i = 0; i < STAR_COUNT; i++) {
      // 均匀球面采样
      const theta = rng() * Math.PI * 2;
      const phi = Math.acos(2 * rng() - 1);
      const r = STARFIELD_RADIUS * (0.85 + rng() * 0.15);

      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.cos(phi);
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);

      // 星等差异：少量偏蓝 / 偏暖的亮星
      const brightness = 0.35 + rng() * 0.65;
      const tint = rng();
      if (tint > 0.92) {
        colors[i * 3] = brightness * 0.75;
        colors[i * 3 + 1] = brightness * 0.85;
        colors[i * 3 + 2] = brightness; // 偏蓝
      } else if (tint < 0.08) {
        colors[i * 3] = brightness;
        colors[i * 3 + 1] = brightness * 0.82; // 偏暖
        colors[i * 3 + 2] = brightness * 0.65;
      } else {
        colors[i * 3] = brightness;
        colors[i * 3 + 1] = brightness;
        colors[i * 3 + 2] = brightness;
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 1.1,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      depthWrite: false
    });

    this.object3d = new THREE.Points(geometry, material);
    this.object3d.frustumCulled = false;
  }
}
