/**
 * 日食 / 月食判断（预留扩展模块）。
 *
 * 当前仿真已具备判断所需的全部几何信息（太阳、行星、卫星的实时世界坐标），
 * 本模块提供纯几何判定函数，暂未接入 UI；后续可在帧循环中调用并在信息面板高亮。
 *
 * 判定原理（三点一线 + 距离条件）：
 * - 月食：行星位于太阳与卫星之间，卫星进入行星本影锥 →
 *   卫星看行星与太阳同向，且卫星-行星距离小于行星本影长度；
 * - 日食：卫星位于太阳与行星之间，卫星阴影投射到行星表面 →
 *   行星看卫星与太阳同向，且行星-卫星距离小于卫星本影长度。
 *
 * 简化实现用「夹角阈值 + 半径遮挡角」近似，未严格计算本影 / 半影锥。
 */
import * as THREE from 'three';

export interface EclipseBody {
  /** 实时世界坐标 */
  getWorldPosition(target: THREE.Vector3): THREE.Vector3;
  /** 渲染半径（仿真单位） */
  readonly radius: number;
}

export type EclipseType = 'solar' | 'lunar' | null;

const _sunPos = new THREE.Vector3();
const _planetPos = new THREE.Vector3();
const _moonPos = new THREE.Vector3();
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();

/**
 * 判断给定行星-卫星系统当前是否发生日食或月食。
 * @param sun     太阳
 * @param planet  行星
 * @param moon    行星的卫星
 * @param angularThresholdDeg 共线夹角阈值（度），越小越严格
 */
export function detectEclipse(
  sun: EclipseBody,
  planet: EclipseBody,
  moon: EclipseBody,
  angularThresholdDeg = 4
): EclipseType {
  sun.getWorldPosition(_sunPos);
  planet.getWorldPosition(_planetPos);
  moon.getWorldPosition(_moonPos);

  const threshold = THREE.MathUtils.degToRad(angularThresholdDeg);

  // ---- 月食：太阳 → 行星 → 卫星 共线，卫星在行星背阳侧 ----
  _v1.copy(_planetPos).sub(_sunPos).normalize(); // 太阳指向行星
  _v2.copy(_moonPos).sub(_planetPos).normalize(); // 行星指向卫星
  const lunarAngle = _v1.angleTo(_v2);
  if (lunarAngle < threshold) {
    // 遮挡角校验：从卫星看，行星视直径需大于太阳视直径
    const moonPlanetDist = _moonPos.distanceTo(_planetPos);
    const sunMoonDist = _moonPos.distanceTo(_sunPos);
    const planetAngularSize = Math.atan2(planet.radius, moonPlanetDist);
    const sunAngularSize = Math.atan2(sun.radius, sunMoonDist);
    if (planetAngularSize > sunAngularSize) return 'lunar';
  }

  // ---- 日食：太阳 → 卫星 → 行星 共线，卫星在行星向阳侧 ----
  _v1.copy(_moonPos).sub(_sunPos).normalize(); // 太阳指向卫星
  _v2.copy(_planetPos).sub(_moonPos).normalize(); // 卫星指向行星
  const solarAngle = _v1.angleTo(_v2);
  if (solarAngle < threshold) {
    const planetMoonDist = _planetPos.distanceTo(_moonPos);
    const sunPlanetDist = _planetPos.distanceTo(_sunPos);
    const moonAngularSize = Math.atan2(moon.radius, planetMoonDist);
    const sunAngularSize = Math.atan2(sun.radius, sunPlanetDist);
    if (moonAngularSize > sunAngularSize * 0.8) return 'solar';
  }

  return null;
}
