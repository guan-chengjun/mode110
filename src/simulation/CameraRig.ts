/**
 * 相机控制器：
 * - 基于 OrbitControls 实现鼠标拖拽旋转、滚轮缩放；
 * - select(target) 时相机平滑移动到目标附近，并在后续帧保持跟随；
 * - 跟随期间用户手动旋转 / 缩放不会丢失目标（每帧重新锚定控制器目标点）；
 * - clearFocus() 取消跟随，恢复自由观察。
 *
 * 实现要点：
 * OrbitControls 每帧 update() 会把相机位置约束为「绕 target 的固定轨道距离」，
 * 直接对 camera.position 做 lerp 会被部分抵消。因此切入阶段改为对
 * 「target→相机 的方向与距离」做指数阻尼，与 OrbitControls 的约束方式同构。
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { Selectable } from '../types';

const TARGET_DAMP = 4.5; // 控制器目标点贴向天体的速率
const DISTANCE_DAMP = 5.5; // 切入阶段相机距离收拢速率
const FOCUS_DISTANCE_FACTOR = 4.5; // 聚焦距离 ≈ 天体包围球半径 × 该系数
const MIN_FOCUS_DISTANCE = 2.5;

/** 帧率无关的指数阻尼系数：低帧率下单帧步长更大，收敛时间保持一致 */
function dampFactor(rate: number, deltaSeconds: number): number {
  return 1 - Math.exp(-rate * deltaSeconds);
}

export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;

  private focusTarget: Selectable | null = null;
  /** 切入过渡标志：true 时相机距离向聚焦距离收拢，到位后转跟随 */
  private docking = false;
  /** 切入阶段的期望观察距离 */
  private desiredDistance = 0;

  private readonly tmpWorld = new THREE.Vector3();
  private readonly tmpOffset = new THREE.Vector3();
  private readonly tmpDir = new THREE.Vector3();

  constructor(aspect: number, domElement: HTMLElement) {
    this.camera = new THREE.PerspectiveCamera(55, aspect, 0.1, 2000);
    this.camera.position.set(0, 28, 62);

    this.controls = new OrbitControls(this.camera, domElement);
    this.controls.enableDamping = true; // 阻尼让旋转更顺滑
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 1.2;
    this.controls.maxDistance = 400;
    this.controls.target.set(0, 0, 0);
  }

  /** 选中天体：记录聚焦距离并启动平滑切入 */
  select(target: Selectable): void {
    this.focusTarget = target;
    // 直接使用天体已知渲染半径，包围盒估算会把轴倾斜 / 辉光计入而失准
    this.desiredDistance = Math.max(
      target.radius * FOCUS_DISTANCE_FACTOR,
      MIN_FOCUS_DISTANCE
    );
    this.docking = true;
  }

  clearFocus(): void {
    this.focusTarget = null;
    this.docking = false;
  }

  get focused(): Selectable | null {
    return this.focusTarget;
  }

  /**
   * 帧更新：
   * 1. 控制器 target 平滑贴到天体世界坐标；
   * 2. 切入阶段沿当前观察方向把相机距离阻尼收拢到聚焦距离；
   * 3. 跟随阶段仅锚定 target（OrbitControls 自动维持距离，用户旋转/缩放正常接管）；
   * 4. 驱动 OrbitControls 阻尼更新。
   */
  update(deltaSeconds: number): void {
    if (this.focusTarget) {
      this.focusTarget.object3d.getWorldPosition(this.tmpWorld);

      // 目标点平滑锚定（帧率无关阻尼）
      this.controls.target.lerp(this.tmpWorld, dampFactor(TARGET_DAMP, deltaSeconds));

      if (this.docking) {
        // 当前相机相对控制器目标的方向与距离
        this.tmpOffset.copy(this.camera.position).sub(this.controls.target);
        const currentDistance = this.tmpOffset.length() || 1;
        this.tmpDir.copy(this.tmpOffset).divideScalar(currentDistance);

        // 距离做指数阻尼收拢，方向保持用户当前观察角度
        const nextDistance = THREE.MathUtils.lerp(
          currentDistance,
          this.desiredDistance,
          dampFactor(DISTANCE_DAMP, deltaSeconds)
        );
        this.camera.position
          .copy(this.controls.target)
          .addScaledVector(this.tmpDir, nextDistance);

        if (Math.abs(nextDistance - this.desiredDistance) < 0.4) {
          this.docking = false;
        }
      }
    }

    this.controls.update();
  }

  /** 窗口尺寸变化时同步投影矩阵 */
  handleResize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }
}
