/**
 * 仿真通用数学工具。
 */
import * as THREE from 'three';

export const DEG2RAD = Math.PI / 180;
export const RAD2DEG = 180 / Math.PI;

/**
 * 确定性伪随机数生成器（mulberry32）。
 * 纹理生成依赖固定 seed，保证每次启动画面一致。
 */
export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 一维平滑值噪声（在整数格点间做 smoothstep 插值） */
function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/**
 * 整数格点哈希：由坐标与种子确定性生成 0~1 随机值。
 * 不依赖外部 rng，保证同一格点每次取值一致（空间相干的基础）。
 */
function hash2(ix: number, iy: number, seed: number): number {
  let h = (ix * 374761393 + iy * 668265263 + seed * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** 基于格点哈希的二维值噪声，输出 0~1（种子决定整张地形） */
export function valueNoise2D(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;

  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);

  const u = smooth(xf);
  const v = smooth(yf);
  return THREE.MathUtils.lerp(
    THREE.MathUtils.lerp(a, b, u),
    THREE.MathUtils.lerp(c, d, u),
    v
  );
}

/**
 * 分形布朗运动（多倍频值噪声叠加），输出约 0~1。
 * 用于生成行星表面自然的大陆 / 条带起伏。
 */
export function fbm(
  x: number,
  y: number,
  seed: number,
  octaves = 5,
  lacunarity = 2,
  gain = 0.5
): number {
  let amplitude = 0.5;
  let frequency = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amplitude * valueNoise2D(x * frequency, y * frequency, seed + i * 101);
    norm += amplitude;
    amplitude *= gain;
    frequency *= lacunarity;
  }
  return sum / norm;
}

export function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/** 线性插值十六进制颜色 */
export function lerpColor(a: THREE.Color, b: THREE.Color, t: number, out: THREE.Color): THREE.Color {
  out.r = THREE.MathUtils.lerp(a.r, b.r, t);
  out.g = THREE.MathUtils.lerp(a.g, b.g, t);
  out.b = THREE.MathUtils.lerp(a.b, b.b, t);
  return out;
}

/**
 * 椭圆轨道上的位置计算。
 * @param a      半长轴
 * @param e      偏心率
 * @param angle  随时间线性变化的轨道角（度）——
 *               简化为匀角速度；后续如需真实开普勒运动，
 *               可在此替换为「解开普勒方程 E - e·sinE = M」的实现。
 * @param out    复用的向量，避免每帧分配
 */
export function ellipsePosition(
  a: number,
  e: number,
  angle: number,
  out: THREE.Vector3
): THREE.Vector3 {
  const b = a * Math.sqrt(1 - e * e); // 半短轴
  const theta = angle * DEG2RAD;
  // 焦点位于原点（太阳处）：中心向 -c 方向偏移 c = a·e
  const c = a * e;
  out.set(a * Math.cos(theta) - c, 0, b * Math.sin(theta));
  return out;
}
