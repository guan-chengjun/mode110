/**
 * 太阳系简化模型的全部天体参数（数据驱动，方便增删天体）。
 *
 * 尺度说明（非真实比例，经压缩以保证同屏可观察）：
 * - 距离单位：场景内 10 单位 ≈ 1 天文单位（AU），见 AU_IN_UNITS；
 * - 行星半径按视觉权重压缩，内行星略放大、气态巨行星略缩小；
 * - 公转速度单位：度 / 仿真秒（timeScale = 1 时），
 *   内侧行星明显更快、外侧行星周期更长；
 * - 各轨道半径分层 + 小偏心率 + 小倾角，保证稳定运行、互不穿插。
 *
 * 模型说明：
 * - modelUrl 全部为可选；留空时直接使用程序化纹理球体，零网络依赖；
 * - 填入开源可商用 GLB 地址（CC0 / CC-BY 等，见 README）后即自动尝试加载，
 *   任何失败都会静默回退为程序化球体并弹出非阻塞提示。
 */
import type { BodyConfig, CometConfig, TextureConfig } from '../types';

/** 场景单位与天文单位换算（10 场景单位 = 1 AU ≈ 1.496 亿公里） */
export const AU_IN_UNITS = 10;
export const KM_PER_AU = 1.496e8;

/** 太阳纹理配置（自发光等离子风格） */
export const SUN_CONFIG: {
  radius: number;
  spinSpeed: number;
  texture: TextureConfig;
  modelUrl?: string;
} = {
  radius: 3.2,
  spinSpeed: 1.2, // 度 / 仿真秒
  texture: {
    style: 'sun',
    baseColor: 0xffaa33,
    detailColor: 0xffe8a0,
    seed: 9917
  },
  // modelUrl: 'https://example.com/models/sun.glb', // 可选：替换为你的开源 GLB 地址
};

/** 八大行星（含地球、木星、土星的卫星示例） */
export const PLANET_CONFIGS: BodyConfig[] = [
  {
    id: 'mercury',
    name: '水星',
    radius: 0.55,
    orbitRadius: 6,
    eccentricity: 0.12,
    orbitSpeed: 14,
    spinSpeed: 2.4,
    initialAngle: 35,
    inclination: 3.4,
    axialTilt: 0.03,
    texture: { style: 'rocky', baseColor: 0x8c7d6e, detailColor: 0x4d443b, seed: 101 },
    // modelUrl: 'https://raw.githubusercontent.com/.../mercury.glb',
  },
  {
    id: 'venus',
    name: '金星',
    radius: 0.95,
    orbitRadius: 9,
    eccentricity: 0.04,
    orbitSpeed: 10.5,
    spinSpeed: -1.1, // 逆向自转
    initialAngle: 160,
    inclination: 1.8,
    axialTilt: 177.4,
    texture: { style: 'rocky', baseColor: 0xd9b36c, detailColor: 0x8a5f2e, seed: 202 },
  },
  {
    id: 'earth',
    name: '地球',
    radius: 1.0,
    orbitRadius: 13,
    eccentricity: 0.05,
    orbitSpeed: 8.2,
    spinSpeed: 18,
    initialAngle: 90,
    inclination: 0.0,
    axialTilt: 23.4,
    texture: { style: 'earth', baseColor: 0x3f8f4e, detailColor: 0xc2a36b, seed: 303 },
    moons: [
      {
        id: 'moon',
        name: '月球',
        radius: 0.27,
        orbitRadius: 2.1,
        orbitSpeed: 26,
        spinSpeed: 26, // 潮汐锁定：公转 ≈ 自转
        initialAngle: 200,
        inclination: 5.1,
        texture: { style: 'moonRock', baseColor: 0xb8b8b8, detailColor: 0x5c5c5c, seed: 304 },
      },
    ],
  },
  {
    id: 'mars',
    name: '火星',
    radius: 0.72,
    orbitRadius: 17,
    eccentricity: 0.09,
    orbitSpeed: 6.4,
    spinSpeed: 17,
    initialAngle: 250,
    inclination: 1.9,
    axialTilt: 25.2,
    texture: { style: 'rocky', baseColor: 0xc1603b, detailColor: 0x6e3320, seed: 404 },
    moons: [
      {
        id: 'phobos',
        name: '火卫一',
        radius: 0.12,
        orbitRadius: 1.35,
        orbitSpeed: 42,
        spinSpeed: 42,
        initialAngle: 60,
        inclination: 1.1,
        texture: { style: 'moonRock', baseColor: 0x8a7d72, detailColor: 0x4a423b, seed: 405 },
      },
    ],
  },
  {
    id: 'jupiter',
    name: '木星',
    radius: 2.7,
    orbitRadius: 25,
    eccentricity: 0.05,
    orbitSpeed: 3.6,
    spinSpeed: 32, // 气态巨行星自转很快
    initialAngle: 300,
    inclination: 1.3,
    axialTilt: 3.1,
    texture: { style: 'gas', baseColor: 0xd8b48c, detailColor: 0x9c6b46, seed: 501 }, // seed 501 触发大红斑
    moons: [
      {
        id: 'io',
        name: '木卫一',
        radius: 0.26,
        orbitRadius: 3.7,
        orbitSpeed: 30,
        spinSpeed: 30,
        initialAngle: 10,
        inclination: 0.05,
        texture: { style: 'rocky', baseColor: 0xe6d86b, detailColor: 0xa66a35, seed: 502 },
      },
      {
        id: 'europa',
        name: '木卫二',
        radius: 0.23,
        orbitRadius: 4.6,
        orbitSpeed: 22,
        spinSpeed: 22,
        initialAngle: 130,
        inclination: 0.47,
        texture: { style: 'ice', baseColor: 0xc9b89a, detailColor: 0x8a7f6d, seed: 503 },
      },
    ],
  },
  {
    id: 'saturn',
    name: '土星',
    radius: 2.3,
    orbitRadius: 34,
    eccentricity: 0.06,
    orbitSpeed: 2.7,
    spinSpeed: 29,
    initialAngle: 20,
    inclination: 2.5,
    axialTilt: 26.7,
    texture: { style: 'gas', baseColor: 0xe3d3a8, detailColor: 0xb09366, seed: 601 },
    ring: {
      innerRadius: 3.0,
      outerRadius: 5.2,
      color: 0xd9c79a,
    },
  },
  {
    id: 'uranus',
    name: '天王星',
    radius: 1.6,
    orbitRadius: 42,
    eccentricity: 0.04,
    orbitSpeed: 1.9,
    spinSpeed: 16,
    initialAngle: 200,
    inclination: 0.8,
    axialTilt: 97.8, // 躺着自转
    texture: { style: 'ice', baseColor: 0x7fd4d9, detailColor: 0xbfeef0, seed: 701 },
  },
  {
    id: 'neptune',
    name: '海王星',
    radius: 1.55,
    orbitRadius: 50,
    eccentricity: 0.03,
    orbitSpeed: 1.4,
    spinSpeed: 17,
    initialAngle: 120,
    inclination: 1.8,
    axialTilt: 28.3,
    texture: { style: 'ice', baseColor: 0x3a5fd0, detailColor: 0x8fb4ef, seed: 801 },
  },
];

/** 彗星：高偏心率狭长椭圆，远日点越过海王星 */
export const COMET_CONFIG: CometConfig = {
  id: 'halley',
  name: '哈雷彗星',
  radius: 0.35,
  orbitRadius: 46,
  eccentricity: 0.82,
  orbitSpeed: 2.2,
  spinSpeed: 8,
  initialAngle: 15,
  inclination: 12,
  maxTrail: 220,
  texture: { style: 'comet', baseColor: 0x9fb4c9, detailColor: 0x4c5a6b, seed: 901 },
  // modelUrl: 'https://example.com/models/comet.glb',
};
