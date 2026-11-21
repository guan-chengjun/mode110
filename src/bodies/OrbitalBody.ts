/**
 * 轨道天体基类。
 *
 * 三层节点结构（理解日食 / 月食扩展时关键）：
 *   tiltNode  （施加轨道倾角，位于公转焦点）
 *     └─ orbitNode （椭圆轨道平面内的位置节点）
 *          └─ spinNode （自转轴倾角 + 自转 + 天体网格）
 *
 * 所有天体按「各自独立的匀角速度」更新角度，互不影响，
 * 因此轨道半径经过分层设计后天然不会互相穿插。
 */
import * as THREE from 'three';
import { DEG2RAD, ellipsePosition } from '../utils/math';
import type { Selectable, BodyInfo } from '../types';

export abstract class OrbitalBody implements Selectable {
  readonly id: string;
  readonly name: string;
  readonly typeLabel: string;

  /** 轨道半长轴 / 偏心率 / 角速度（度每秒） */
  protected readonly orbitRadius: number;
  protected readonly eccentricity: number;
  protected readonly orbitSpeed: number;
  protected readonly spinSpeed: number;
  protected readonly initialAngle: number;

  /** 当前公转角度（度），reset 时回到 initialAngle */
  protected currentAngle: number;

  /** 渲染球体半径（仿真单位） */
  readonly radius: number;

  /** 节点组 */
  readonly tiltNode: THREE.Object3D;
  readonly orbitNode: THREE.Object3D;
  readonly spinNode: THREE.Object3D;

  /** 当前可被 raycast 命中的网格（模型替换后自动切换） */
  protected pickMesh: THREE.Object3D | null = null;

  private readonly tmpPosition = new THREE.Vector3();

  constructor(params: {
    id: string;
    name: string;
    typeLabel: string;
    orbitRadius: number;
    eccentricity: number;
    orbitSpeed: number;
    spinSpeed: number;
    initialAngle: number;
    inclination: number;
    axialTilt: number;
    radius: number;
  }) {
    this.id = params.id;
    this.name = params.name;
    this.typeLabel = params.typeLabel;
    this.orbitRadius = params.orbitRadius;
    this.eccentricity = params.eccentricity;
    this.orbitSpeed = params.orbitSpeed;
    this.spinSpeed = params.spinSpeed;
    this.initialAngle = params.initialAngle;
    this.currentAngle = params.initialAngle;
    this.radius = params.radius;

    this.tiltNode = new THREE.Object3D();
    this.tiltNode.rotation.x = params.inclination * DEG2RAD;

    this.orbitNode = new THREE.Object3D();
    this.tiltNode.add(this.orbitNode);

    this.spinNode = new THREE.Object3D();
    this.spinNode.rotation.z = params.axialTilt * DEG2RAD;
    this.orbitNode.add(this.spinNode);

    // 拾取代理：递归 raycast 命中内部任意网格（含后续替换的 GLB 模型）后，
    // 沿父链向上找到该标记即可拿到天体对象，模型热替换不会让拾取失效。
    this.spinNode.userData.selectable = this;
  }

  /** 供选择系统使用：统一返回 spinNode（相机跟随其世界坐标） */
  get object3d(): THREE.Object3D {
    return this.spinNode;
  }

  /**
   * 帧更新：推进公转与自转。
     * @param deltaSeconds 帧间隔（秒，真实时间）
   * @param timeScale     全局时间流速（0 表示暂停）
   */
  update(deltaSeconds: number, timeScale: number): void {
    if (timeScale === 0) return;
    const simDelta = deltaSeconds * timeScale;

    this.currentAngle = (this.currentAngle + this.orbitSpeed * simDelta) % 360;
    this.spinNode.rotateY(this.spinSpeed * simDelta * DEG2RAD);

    ellipsePosition(
      this.orbitRadius,
      this.eccentricity,
      this.currentAngle,
      this.tmpPosition
    );
    this.orbitNode.position.copy(this.tmpPosition);
  }

  /** 重置到初始相位（相机与选中状态不受影响） */
  reset(): void {
    this.currentAngle = this.initialAngle;
    ellipsePosition(
      this.orbitRadius,
      this.eccentricity,
      this.currentAngle,
      this.tmpPosition
    );
    this.orbitNode.position.copy(this.tmpPosition);
  }

  getBodyInfo(): BodyInfo {
    return {
      id: this.id,
      name: this.name,
      typeLabel: this.typeLabel,
      orbitSpeed: this.orbitSpeed,
      spinSpeed: this.spinSpeed
    };
  }

  getOrbitSpeed(): number {
    return this.orbitSpeed;
  }

  /** 距太阳距离：tiltNode 位于太阳处，orbitNode 的世界坐标长度即实时距离 */
  getDistanceToSun(): number {
    this.orbitNode.getWorldPosition(this.tmpPosition);
    return this.tmpPosition.length();
  }

  /** 当前世界坐标（相机跟随 / 日食判断使用） */
  getWorldPosition(target: THREE.Vector3): THREE.Vector3 {
    return this.spinNode.getWorldPosition(target);
  }

  getPickMesh(): THREE.Object3D | null {
    return this.pickMesh;
  }

  /** 替换内部网格（GLB 模型加载成功后调用），保持阴影与拾取可用 */
  protected replaceMesh(next: THREE.Object3D): void {
    if (this.pickMesh) this.spinNode.remove(this.pickMesh);
    this.pickMesh = next;
    this.spinNode.add(next);
  }
}
