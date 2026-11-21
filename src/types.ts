/**
 * 天体配置与运行时共享的类型定义。
 * 所有角度统一使用「度（deg）」，进入 three.js 前由工具函数转弧度。
 */
import type * as THREE from 'three';

/** 程序化纹理风格标识，由 textures.ts 对应生成 */
export type TextureStyle =
  | 'rocky' // 岩石行星：噪声大陆 + 随机陨石坑
  | 'earth' // 类地行星：海洋 + 大陆 + 冰盖
  | 'gas' // 气态巨行星：条带 + 椭圆涡旋
  | 'ice' // 冰巨星：柔和青蓝渐变
  | 'moonRock' // 卫星：高对比月面环形山
  | 'sun' // 太阳：高温等离子噪声
  | 'comet'; // 彗星核：脏雪球岩冰混合

export interface TextureConfig {
  style: TextureStyle;
  /** 主基色（十六进制，如 0x8a5a2b） */
  baseColor: number;
  /** 噪声叠加色 */
  detailColor: number;
  /** 随机种子，保证同天体每次启动纹理一致 */
  seed: number;
}

/** 卫星（月球）配置 */
export interface MoonConfig {
  id: string;
  name: string;
  radius: number;
  /** 围绕母行星的轨道半径（仿真单位） */
  orbitRadius: number;
  /** 公转速度（度 / 仿真秒） */
  orbitSpeed: number;
  /** 自转速度（度 / 仿真秒） */
  spinSpeed: number;
  /** 初始公转相位（度），让各卫星初始位置错开 */
  initialAngle: number;
  /** 轨道相对黄道面倾角（度） */
  inclination: number;
  texture: TextureConfig;
  /**
   * 可选外部 GLB 模型地址（开源可商用资源，见 README 资源清单）。
   * 留空或加载失败时自动回退为程序化球体。
   */
  modelUrl?: string;
}

/** 行星配置（含自带卫星） */
export interface BodyConfig {
  id: string;
  name: string;
  /** 渲染球体半径（仿真单位，非真实比例，经压缩便于同屏观察） */
  radius: number;
  /** 轨道半长轴（仿真单位；场景内 10 单位 ≈ 1 天文单位 AU） */
  orbitRadius: number;
  /** 椭圆轨道偏心率 0~1（取较小值保证轨道互不穿插） */
  eccentricity: number;
  /** 公转速度（度 / 仿真秒），内侧快、外侧慢 */
  orbitSpeed: number;
  /** 自转速度（度 / 仿真秒） */
  spinSpeed: number;
  /** 初始公转相位（度） */
  initialAngle: number;
  /** 轨道倾角（度） */
  inclination: number;
  /** 自转轴倾角（度） */
  axialTilt: number;
  texture: TextureConfig;
  modelUrl?: string;
  moons?: MoonConfig[];
  /** 可选行星环（如土星） */
  ring?: {
    innerRadius: number;
    outerRadius: number;
    color: number;
  };
}

/** 彗星配置：狭长椭圆轨道 */
export interface CometConfig {
  id: string;
  name: string;
  radius: number;
  orbitRadius: number;
  eccentricity: number;
  orbitSpeed: number;
  spinSpeed: number;
  initialAngle: number;
  inclination: number;
  /** 拖尾最大采样点数 */
  maxTrail: number;
  texture: TextureConfig;
  modelUrl?: string;
}

/** 选中目标信息面板需要的只读数据 */
export interface BodyInfo {
  id: string;
  name: string;
  typeLabel: string;
  orbitSpeed: number;
  spinSpeed: number;
}

/** 拾取（raycast）注册表条目：把可点击网格映射回天体对象 */
export interface PickerEntry {
  mesh: THREE.Object3D;
  selectable: Selectable;
}

/** 所有可被选中的天体的统一接口 */
export interface Selectable {
  readonly id: string;
  readonly name: string;
  readonly typeLabel: string;
  /** 供相机平滑跟随与拾取使用的三维对象 */
  readonly object3d: THREE.Object3D;
  /** 渲染球体半径（仿真单位），用于高亮环与聚焦距离估算 */
  readonly radius: number;
  getBodyInfo(): BodyInfo;
  /** 距太阳的实时距离（仿真单位） */
  getDistanceToSun(): number;
  /** 公转速度（度 / 仿真秒），太阳与无公转天体返回 0 */
  getOrbitSpeed(): number;
}
