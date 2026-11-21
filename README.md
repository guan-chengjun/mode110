# 太阳系行星轨道 3D 仿真

基于 **Three.js + Vite + TypeScript** 的纯前端太阳系简化模型仿真。打开页面即加载场景，无需后端服务；所有外部 GLB 模型加载失败时都会自动回退为程序化纹理球体。

## 功能一览

- **太阳系简化模型**：太阳 + 八大行星 + 地球/火星/木星的卫星，土星带行星环。
- **程序化兜底**：默认全部使用 Canvas 程序化生成的 PBR 纹理球体（零网络依赖）；可选加载开源 GLB 模型，任何加载失败自动回退，页面顶部内嵌加载条 + 右下角非阻塞 toast 提示，无弹窗。
- **轨道运动**：每颗行星独立椭圆轨道（半长轴 / 偏心率 / 倾角 / 轴倾角各异），内侧行星公转快、外侧周期长；行星同时缓慢自转，卫星随行星层级运动。轨道半径分层设计，运行稳定、互不穿插。
- **彗星**：高偏心率狭长椭圆轨道，`THREE.Points` 历史采样拖尾，靠近太阳时彗发更亮、拖尾更长。
- **时间控制**：滑块调节全局时间流速（0～10×，支持慢放 / 快进），暂停 / 继续按钮，一键重置全部天体位置。
- **交互**：鼠标拖拽旋转视角、滚轮缩放；点击任意天体（含卫星、彗星）选中，相机平滑移动并持续跟随；下拉框也可选择。信息面板显示名称、类型、公转 / 自转速度、实时距太阳距离（场景单位 / AU / 公里）。
- **显示开关**：轨道线、彗星效果（含彗核、拖尾、轨道）可独立开关。
- **渲染**：PBR（MeshStandardMaterial）+ PCF 软阴影 + ACES 色调映射，太阳自发光材质配合 UnrealBloom 泛光，微弱环境光保证暗面通透，4500 颗星点的星空背景。
- **工程化**：统一 `requestAnimationFrame` 帧循环、窗口尺寸自适应、模块化 TypeScript 源码、清晰中文注释。

## 快速开始

```bash
npm install
npm run dev      # 本地开发，自动打开 http://localhost:5173
npm run build    # 类型检查 + 生产构建，产物在 dist/
npm run preview  # 预览构建产物
npm run typecheck # 仅 TypeScript 类型检查
```

### 自动化冒烟测试（可选）

`scripts/smoke-test.mjs` 通过 Chrome DevTools Protocol 驱动真实浏览器，覆盖帧循环、暂停、选中聚焦、信息面板、轨道线 / 彗星开关、时间流速、重置、窗口自适应共 23 项断言：

```bash
# 1. 先启动开发服务器
npm run dev
# 2. 另开终端，启动带远程调试端口的 headless Chrome
chrome --headless=new --remote-debugging-port=9222 --use-angle=swiftshader about:blank
# 3. 运行测试
npm run smoke
```

## 目录结构

```
src/
├── main.ts                  # 入口，挂载仿真
├── styles.css               # 面板 / 加载条 / toast 样式
├── types.ts                 # 天体配置与接口类型
├── Simulation.ts            # 核心：场景、渲染、拾取、帧循环
├── materials.ts             # PBR / 自发光材质与兜底球体工厂
├── textures.ts              # 程序化纹理（岩石/类地/气态/冰巨星/太阳/彗星/环/辉光）
├── modelLoader.ts           # GLTFLoader 封装 + 归一化 + 失败兜底
├── orbitLine.ts             # 半透明椭圆轨道线
├── Starfield.ts             # 星空背景
├── data/
│   └── bodiesData.ts        # 全部天体参数（数据驱动，增删天体改这里）
├── bodies/
│   ├── OrbitalBody.ts       # 轨道天体基类（tilt/orbit/spin 三层节点）
│   ├── Sun.ts               # 太阳（自发光 + PointLight 阴影光源）
│   ├── Planet.ts            # 行星（含卫星、行星环、轨道线）
│   ├── Moon.ts              # 卫星
│   └── Comet.ts             # 彗星 + 拖尾
├── simulation/
│   ├── TimeController.ts    # 时间流速 / 暂停
│   ├── CameraRig.ts         # OrbitControls + 平滑聚焦跟随
│   └── eclipse.ts           # 日食 / 月食几何判定（预留扩展）
└── ui/
    └── UiController.ts      # 控制面板与信息面板
```

## 接入开源 GLB 模型

`src/data/bodiesData.ts` 中每个天体都有可选的 `modelUrl` 字段（默认留空，走程序化球体）。填入 GLB/GLTF 地址即可，例如：

```ts
{
  id: 'earth',
  // ...
  modelUrl: 'https://你的静态资源地址/earth.glb',
}
```

加载行为：

1. 顶部出现内嵌加载条显示当前加载的天体；
2. 成功后模型自动居中并缩放到与原球体一致的半径，阴影与点击拾取无缝接管；
3. 失败（404 / 跨域 / 解析错误）时 toast 提示并保留程序化球体，仿真不中断。

建议选用 **CC0 / CC-BY / Apache-2.0** 等可商用许可资源，常见来源：

- [NASA 3D Models](https://nasa3d.arc.nasa.gov/models)（NASA 官方模型，多为公共领域）
- [Sketchfab](https://sketchfab.com/) 筛选 CC 许可标签（注意逐模型核对许可与署名要求）
- [Poly Pizza](https://poly.pizza/)（大量 CC-BY / CC0 低模）
- [Science On a Sphere – SOS](https://sos.noaa.gov/)（NOAA 公开数据集与球体纹理）

> 跨域加载时资源服务器需返回 `Access-Control-Allow-Origin`，否则会按加载失败处理并自动兜底。

## 尺度与参数约定

- 距离：场景内 **10 单位 ≈ 1 AU**（约 1.496 亿公里），半径与距离均为视觉压缩比例，非真实比例。
- 速度：角度单位为「度 / 仿真秒」，`timeScale = 1` 时生效；滑块 0～10× 线性缩放。
- 轨道：`ellipsePosition()`（`src/utils/math.ts`）使用焦点在原点的椭圆方程，当前为匀角速度简化模型。

## 扩展：日食 / 月食判断

`src/simulation/eclipse.ts` 已实现纯几何判定 `detectEclipse(sun, planet, moon)`，基于三点共线夹角与遮挡天体视直径比较，返回 `'solar' | 'lunar' | null`。在 `Simulation.ts` 帧循环标注的「扩展点」处遍历带卫星的行星调用即可接入 UI 提示。

后续若要做严格开普勒运动，可将 `ellipsePosition()` 的线性角度替换为解开普勒方程 `E − e·sinE = M`，上层节点结构无需改动。
