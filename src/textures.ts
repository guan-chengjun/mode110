/**
 * 程序化纹理工厂：
 * 全部基于 Canvas 2D + 值噪声生成，运行时不依赖外部图片资源。
 * 当 GLB 模型加载失败、回退为 SphereGeometry 时，球体仍有完整 PBR 表面外观。
 */
import * as THREE from 'three';
import type { TextureConfig } from './types';
import { createRng, fbm, clamp01, lerpColor } from './utils/math';

const TEXTURE_SIZE = 512;

/** 把十六进制颜色转为 [r,g,b] 0~255 */
function hexToRgb(hex: number): [number, number, number] {
  return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
}

/** 生成一张等距柱状投影（equirectangular）画布并包装成 CanvasTexture */
function createCanvas(size: number): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  image: ImageData;
} {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size / 2;
  const ctx = canvas.getContext('2d')!;
  const image = ctx.createImageData(canvas.width, canvas.height);
  return { canvas, ctx, image };
}

function toTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping; // 水平方向环绕（经度 0~360°）
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = 8;
  return texture;
}

/* ---------------- 各风格表面实现 ---------------- */

/** 岩石行星 / 彗星核：噪声地块 + 随机陨石坑 */
function paintRocky(cfg: TextureConfig, image: ImageData, craterCount: number, ice = false): void {
  const rng = createRng(cfg.seed);
  const base = new THREE.Color(cfg.baseColor);
  const detail = new THREE.Color(cfg.detailColor);
  const tmp = new THREE.Color();
  const w = image.width;
  const h = image.height;

  // 预生成陨石坑（等距柱状坐标，u/v 为 0~1）
  const craters = Array.from({ length: craterCount }, () => ({
    u: rng(),
    v: rng(),
    r: 0.01 + rng() * 0.035,
    depth: 0.35 + rng() * 0.4
  }));

  for (let y = 0; y < h; y++) {
    const v = y / h;
    for (let x = 0; x < w; x++) {
      const u = x / w;
      let n = fbm(u * 8, v * 4, cfg.seed, 5);
      n = clamp01(0.55 + (n - 0.5) * 1.6);

      // 陨石坑暗化（环形凹陷效果近似）
      let craterShade = 0;
      for (const c of craters) {
        let du = Math.abs(u - c.u);
        du = Math.min(du, 1 - du); // 经度环绕
        const dv = v - c.v;
        const d = Math.sqrt(du * du + dv * dv);
        if (d < c.r) {
          const t = d / c.r;
          craterShade -= c.depth * (1 - t) * 0.55; // 坑底变暗
          if (t > 0.75) craterShade += c.depth * 0.25; // 坑沿略亮
        }
      }

      lerpColor(base, detail, n, tmp);
      const shade = clamp01(0.82 + craterShade + (n - 0.5) * 0.25);
      const i = (y * w + x) * 4;
      image.data[i] = tmp.r * 255 * shade;
      image.data[i + 1] = tmp.g * 255 * shade;
      image.data[i + 2] = tmp.b * 255 * shade;
      image.data[i + 3] = 255;
    }
  }

  if (ice) {
    // 两极冰盖泛白
    for (let y = 0; y < h; y++) {
      const polar = clamp01((Math.abs(y / h - 0.5) - 0.42) / 0.08);
      if (polar <= 0) continue;
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        image.data[i] = THREE.MathUtils.lerp(image.data[i], 235, polar);
        image.data[i + 1] = THREE.MathUtils.lerp(image.data[i + 1], 240, polar);
        image.data[i + 2] = THREE.MathUtils.lerp(image.data[i + 2], 248, polar);
      }
    }
  }
}

/** 类地行星（地球）：海洋、大陆、沙漠、极区冰盖 */
function paintEarth(cfg: TextureConfig, image: ImageData): void {
  const ocean = new THREE.Color(0x143d78);
  const shallow = new THREE.Color(0x2e7bb8);
  const land = new THREE.Color(cfg.baseColor);
  const dry = new THREE.Color(cfg.detailColor);
  const iceColor = new THREE.Color(0xeef4ff);
  const tmp = new THREE.Color();
  const w = image.width;
  const h = image.height;

  for (let y = 0; y < h; y++) {
    const v = y / h;
    const latitude = (v - 0.5) * Math.PI; // -90°~90°
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const continent = fbm(u * 6, v * 3, cfg.seed, 6);
      const moisture = fbm(u * 4 + 13.7, v * 2 + 7.1, cfg.seed + 777, 4);
      const i = (y * w + x) * 4;

      if (continent < 0.52) {
        // 海洋：越深越暗
        const depth = clamp01((0.52 - continent) / 0.2);
        lerpColor(shallow, ocean, depth, tmp);
      } else {
        // 陆地：湿度低的赤道区域偏沙漠色
        const dryness = clamp01((0.5 - moisture) * 2) * (1 - Math.abs(Math.sin(latitude)));
        lerpColor(land, dry, dryness, tmp);
      }

      // 两极冰盖
      const polarIce = clamp01((Math.abs(latitude) - 1.15) / 0.28);
      if (polarIce > 0) tmp.lerp(iceColor, polarIce);

      image.data[i] = tmp.r * 255;
      image.data[i + 1] = tmp.g * 255;
      image.data[i + 2] = tmp.b * 255;
      image.data[i + 3] = 255;
    }
  }
}

/** 气态巨行星：纬度条带 + 湍流涡旋（如木星大红斑） */
function paintGasGiant(cfg: TextureConfig, image: ImageData, vortex: boolean): void {
  const bandA = new THREE.Color(cfg.baseColor);
  const bandB = new THREE.Color(cfg.detailColor);
  const tmp = new THREE.Color();
  const w = image.width;
  const h = image.height;

  // 大红斑位置（固定种子区域）
  const spotU = 0.68;
  const spotV = 0.62;

  for (let y = 0; y < h; y++) {
    const v = y / h;
    for (let x = 0; x < w; x++) {
      const u = x / w;
      // 条带：以纬度为主频率，加入纵向湍流扰动
      const turbulence = fbm(u * 10, v * 6, cfg.seed, 4) - 0.5;
      const bandWave = Math.sin((v * 14 + turbulence * 0.9) * Math.PI * 2);
      const t = clamp01(0.5 + bandWave * 0.5);
      lerpColor(bandA, bandB, t, tmp);

      // 亮度微扰，避免条带过于机械
      const shade = 0.9 + fbm(u * 16, v * 8, cfg.seed + 313, 3) * 0.2;

      let r = tmp.r * 255 * shade;
      let g = tmp.g * 255 * shade;
      let b = tmp.b * 255 * shade;

      if (vortex) {
        let du = Math.abs(u - spotU);
        du = Math.min(du, 1 - du);
        const dv = v - spotV;
        const d = Math.sqrt((du * 2.2) ** 2 + (dv * 3.4) ** 2);
        if (d < 0.13) {
          const mix = 1 - d / 0.13;
          r = THREE.MathUtils.lerp(r, 196, mix * 0.85);
          g = THREE.MathUtils.lerp(g, 84, mix * 0.85);
          b = THREE.MathUtils.lerp(b, 58, mix * 0.85);
        }
      }

      const i = (y * w + x) * 4;
      image.data[i] = r;
      image.data[i + 1] = g;
      image.data[i + 2] = b;
      image.data[i + 3] = 255;
    }
  }
}

/** 冰巨星：柔和的青蓝纵向渐变 + 轻微甲烷云纹 */
function paintIceGiant(cfg: TextureConfig, image: ImageData): void {
  const deep = new THREE.Color(cfg.baseColor);
  const high = new THREE.Color(cfg.detailColor);
  const tmp = new THREE.Color();
  const w = image.width;
  const h = image.height;

  for (let y = 0; y < h; y++) {
    const v = y / h;
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const clouds = fbm(u * 8, v * 3, cfg.seed, 4) * 0.18;
      lerpColor(deep, high, clamp01(1 - Math.abs(v - 0.5) * 1.6), tmp);
      const i = (y * w + x) * 4;
      image.data[i] = clamp01(tmp.r + clouds) * 255;
      image.data[i + 1] = clamp01(tmp.g + clouds) * 255;
      image.data[i + 2] = clamp01(tmp.b + clouds) * 255;
      image.data[i + 3] = 255;
    }
  }
}

/** 太阳表面：亮黄到橙红的高温等离子噪声 */
function paintSun(image: ImageData): void {
  const seed = 9917;
  const hot = new THREE.Color(0xfff2b0);
  const mid = new THREE.Color(0xffa733);
  const dark = new THREE.Color(0xd84b12);
  const tmp = new THREE.Color();
  const w = image.width;
  const h = image.height;

  for (let y = 0; y < h; y++) {
    const v = y / h;
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const n = fbm(u * 12, v * 6, seed, 6);
      // 双段插值：暗区 -> 主色 -> 高亮耀斑
      if (n < 0.55) lerpColor(dark, mid, n / 0.55, tmp);
      else lerpColor(mid, hot, (n - 0.55) / 0.45, tmp);

      const granulation = 0.92 + fbm(u * 40, v * 20, seed + 515, 2) * 0.16;
      const i = (y * w + x) * 4;
      image.data[i] = clamp01(tmp.r * granulation) * 255;
      image.data[i + 1] = clamp01(tmp.g * granulation) * 255;
      image.data[i + 2] = clamp01(tmp.b * granulation) * 255;
      image.data[i + 3] = 255;
    }
  }
}

/**
 * 程序化纹理入口：根据配置风格生成对应 CanvasTexture。
 * 该函数同步执行（单张 512×256，毫秒级），可在初始化阶段直接调用。
 */
export function createProceduralTexture(cfg: TextureConfig): THREE.CanvasTexture {
  const { canvas, ctx, image } = createCanvas(TEXTURE_SIZE);

  switch (cfg.style) {
    case 'earth':
      paintEarth(cfg, image);
      break;
    case 'gas':
      paintGasGiant(cfg, image, cfg.seed === 501); // 木星（seed 501）带大红斑
      break;
    case 'ice':
      paintIceGiant(cfg, image);
      break;
    case 'moonRock':
      paintRocky(cfg, image, 55);
      break;
    case 'rocky':
      paintRocky(cfg, image, 22, true);
      break;
    case 'comet':
      paintRocky(cfg, image, 12);
      break;
    case 'sun':
      paintSun(image);
      break;
  }

  ctx.putImageData(image, 0, 0);
  return toTexture(canvas);
}

/** 行星环纹理：径向透明度条带（土星环的卡西尼缝近似） */
export function createRingTexture(color: number): THREE.CanvasTexture {
  const width = 512;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = 1;
  const ctx = canvas.getContext('2d')!;
  const image = ctx.createImageData(width, 1);
  const [r, g, b] = hexToRgb(color);

  for (let x = 0; x < width; x++) {
    const t = x / width;
    // 多层环缝：用正弦叠加制造疏密变化
    const bands =
      0.55 +
      0.25 * Math.sin(t * 34) +
      0.12 * Math.sin(t * 97);
    // 内外边缘淡出，中部留出一条较暗的卡西尼缝
    const edgeFade = Math.sin(t * Math.PI);
    const cassini = Math.abs(t - 0.62) < 0.025 ? 0.25 : 1;
    const alpha = clamp01(bands) * edgeFade * cassini;

    const i = x * 4;
    image.data[i] = r;
    image.data[i + 1] = g;
    image.data[i + 2] = b;
    image.data[i + 3] = alpha * 235;
  }

  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * 太阳光晕 / 彗星彗发用的径向渐变 Sprite 贴图。
 * 中心亮、边缘透明，配合 AdditiveBlending 形成辉光。
 */
export function createGlowTexture(innerColor: number, outerColor: number): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2
  );
  const [r1, g1, b1] = hexToRgb(innerColor);
  const [r2, g2, b2] = hexToRgb(outerColor);
  gradient.addColorStop(0, `rgba(${r1},${g1},${b1},1)`);
  gradient.addColorStop(0.25, `rgba(${r1},${g1},${b1},0.55)`);
  gradient.addColorStop(1, `rgba(${r2},${g2},${b2},0)`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
