/**
 * 半透明椭圆轨道线。
 * 用 LineLoop 按椭圆参数方程采样生成闭合曲线，
 * 再施加与天体相同的轨道倾角，保证轨道线与实际运行轨迹完全重合。
 */
import * as THREE from 'three';
import { DEG2RAD, ellipsePosition } from './utils/math';

const SEGMENTS = 256;

export class OrbitLine {
  readonly object3d: THREE.Object3D;
  private readonly line: THREE.LineLoop;

  constructor(
    semiMajorAxis: number,
    eccentricity: number,
    inclinationDeg: number,
    color = 0x7fa8ff
  ) {
    const points: THREE.Vector3[] = [];
    const tmp = new THREE.Vector3();
    for (let i = 0; i < SEGMENTS; i++) {
      const angle = (i / SEGMENTS) * 360;
      ellipsePosition(semiMajorAxis, eccentricity, angle, tmp);
      points.push(tmp.clone());
    }

    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: 0.28,
      depthWrite: false
    });
    this.line = new THREE.LineLoop(geometry, material);

    // 倾角容器：与 OrbitalBody 的倾斜节点逻辑保持一致
    this.object3d = new THREE.Object3D();
    this.object3d.rotation.x = inclinationDeg * DEG2RAD;
    this.object3d.add(this.line);
  }

  setVisible(visible: boolean): void {
    this.object3d.visible = visible;
  }

  dispose(): void {
    this.line.geometry.dispose();
    (this.line.material as THREE.Material).dispose();
  }
}
