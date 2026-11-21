/**
 * 仿真核心：
 * 负责场景/渲染器/后期泛光的搭建、天体注册、拾取选中、相机聚焦、
 * 轨道线与彗星开关、重置、窗口自适应，以及统一的 requestAnimationFrame 帧循环。
 *
 * 帧循环顺序（注释中标注，便于后续插入日食 / 月食判定）：
 *   1. TimeController 给出 timeScale
 *   2. 全部天体 update（公转 + 自转 + 彗星拖尾）
 *   3. 【扩展点】可在此调用 detectEclipse() 做食相判断
 *   4. 相机跟随更新
 *   5. 信息面板节流刷新
 *   6. EffectComposer 输出
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { Sun } from './bodies/Sun';
import { Planet } from './bodies/Planet';
import { Comet } from './bodies/Comet';
import { Starfield } from './Starfield';
import { OrbitLine } from './orbitLine';
import { TimeController } from './simulation/TimeController';
import { CameraRig } from './simulation/CameraRig';
import { UiController } from './ui/UiController';
import { modelLoader } from './modelLoader';
import { SUN_CONFIG, PLANET_CONFIGS, COMET_CONFIG } from './data/bodiesData';
import type { Selectable } from './types';

const INFO_REFRESH_INTERVAL = 0.15; // 信息面板刷新间隔（秒），避免高频写 DOM

export class Simulation {
  private readonly container: HTMLElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly composer: EffectComposer;
  private readonly bloomPass: UnrealBloomPass;
  private readonly cameraRig: CameraRig;
  private readonly time: TimeController;
  private readonly ui: UiController;

  private readonly sun: Sun;
  private readonly planets: Planet[] = [];
  private readonly comet: Comet;
  private readonly starfield: Starfield;
  private readonly orbitLines: OrbitLine[] = [];
  private readonly registry: Selectable[] = [];
  /** 可拾取根节点：节点 userData.selectable 指向对应天体，递归命中后沿父链查找 */
  private readonly pickRoots: THREE.Object3D[] = [];

  /** 选中高亮环（始终朝向相机的线框圆环） */
  private readonly selectionMarker: THREE.Mesh;
  private selected: Selectable | null = null;

  private readonly clock = new THREE.Clock();
  private infoTimer = 0;
  private rafId = 0;
  private disposed = false;

  // 拾取事件复用变量
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private pointerDownPos = { x: 0, y: 0 };

  constructor(container: HTMLElement) {
    this.container = container;

    /* ---------- 渲染器：PBR + 阴影 + 色调映射 ---------- */
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    /* ---------- 场景与微弱环境光 ---------- */
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x02030a);
    // 微弱环境光保证行星暗面不是纯黑，整体画面通透
    const ambient = new THREE.AmbientLight(0x445577, 0.55);
    this.scene.add(ambient);
    // 半球光补充天 / 地渐变环境，让暗面保留微弱冷色细节
    const hemi = new THREE.HemisphereLight(0x8899cc, 0x1a1428, 0.35);
    this.scene.add(hemi);

    /* ---------- 相机与控制器 ---------- */
    const aspect = container.clientWidth / container.clientHeight;
    this.cameraRig = new CameraRig(aspect, this.renderer.domElement);
    this.time = new TimeController();

    /* ---------- 星空背景 ---------- */
    this.starfield = new Starfield();
    this.scene.add(this.starfield.object3d);

    /* ---------- 太阳 ---------- */
    this.sun = new Sun(SUN_CONFIG.radius, SUN_CONFIG.spinSpeed, SUN_CONFIG.texture, SUN_CONFIG.modelUrl);
    this.scene.add(this.sun.object3d);
    this.registry.push(this.sun);
    this.pickRoots.push(this.sun.object3d);

    /* ---------- 八大行星 + 卫星 + 轨道线 ---------- */
    for (const cfg of PLANET_CONFIGS) {
      const planet = new Planet(cfg);
      this.planets.push(planet);
      this.scene.add(planet.tiltNode);
      this.scene.add(planet.orbitLine.object3d);
      this.orbitLines.push(planet.orbitLine);
      this.registry.push(planet);
      this.pickRoots.push(planet.spinNode);

      // 卫星同样可点击选中（spinNode 已带 selectable 标记）
      for (const moon of planet.moons) {
        this.registry.push(moon);
        this.pickRoots.push(moon.spinNode);
      }

      planet.initModelLoading();
    }

    /* ---------- 彗星 + 狭长椭圆轨道 + 拖尾 ---------- */
    this.comet = new Comet(COMET_CONFIG);
    this.scene.add(this.comet.tiltNode);
    this.scene.add(this.comet.orbitLine.object3d);
    this.scene.add(this.comet.getTrailObject());
    this.orbitLines.push(this.comet.orbitLine);
    this.registry.push(this.comet);
    this.pickRoots.push(this.comet.spinNode);

    /* ---------- 选中高亮环 ---------- */
    const markerGeometry = new THREE.TorusGeometry(1, 0.02, 8, 64);
    const markerMaterial = new THREE.MeshBasicMaterial({
      color: 0x6ea8ff,
      transparent: true,
      opacity: 0.9,
      depthTest: false
    });
    this.selectionMarker = new THREE.Mesh(markerGeometry, markerMaterial);
    this.selectionMarker.visible = false;
    this.selectionMarker.renderOrder = 999;
    this.scene.add(this.selectionMarker);

    /* ---------- 后期：Bloom 让太阳 / 彗发自然发光 ---------- */
    this.composer = new EffectComposer(this.renderer);
    this.composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.composer.addPass(new RenderPass(this.scene, this.cameraRig.camera));
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(container.clientWidth, container.clientHeight),
      0.75, // strength
      0.55, // radius
      0.82  // threshold：仅高亮自发光区域产生泛光
    );
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(new OutputPass());

    /* ---------- UI 接线 ---------- */
    this.ui = new UiController({
      onSpeedChange: (scale) => this.handleSpeedChange(scale),
      onTogglePause: () => this.handleTogglePause(),
      onReset: () => this.handleReset(),
      onToggleOrbits: (visible) => this.setOrbitLinesVisible(visible),
      onToggleComet: (visible) => this.comet.setEffectVisible(visible),
      onSelectBody: (id) => this.handleSelectById(id)
    });
    this.ui.populateBodyOptions(this.registry);
    this.ui.setPauseButton(false);

    this.configureModelLoader();
    this.bindPointerEvents();
    window.addEventListener('resize', this.handleResize);
  }

  /* ================= 模型加载提示与兜底 ================= */

  private configureModelLoader(): void {
    modelLoader.setCallbacks({
      onStart: (label) => this.ui.showLoading(`正在加载「${label}」GLB 模型…`),
      onNotice: (message) => this.ui.showToast(message),
      onSettled: () => this.ui.hideLoading()
    });
    // 串行处理全部排队模型；失败已在 loader 内部回退，这里无需额外处理
    void modelLoader.process();
  }

  /* ================= 指针拾取 ================= */

  private bindPointerEvents(): void {
    const dom = this.renderer.domElement;
    dom.addEventListener('pointerdown', (e) => {
      this.pointerDownPos = { x: e.clientX, y: e.clientY };
    });
    dom.addEventListener('pointerup', (e) => {
      // 拖拽旋转产生的位移不视为点击
      const dx = e.clientX - this.pointerDownPos.x;
      const dy = e.clientY - this.pointerDownPos.y;
      if (Math.hypot(dx, dy) > 5) return;
      this.pick(e.clientX, e.clientY);
    });
  }

  private pick(clientX: number, clientY: number): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.cameraRig.camera);

    // 递归检测：GLB 模型内部子网格也能命中
    const hits = this.raycaster.intersectObjects(this.pickRoots, true);

    if (hits.length === 0) {
      this.clearSelection();
      return;
    }

    // 沿父链查找带 selectable 标记的拾取代理节点
    let node: THREE.Object3D | null = hits[0].object;
    while (node && !node.userData.selectable) {
      node = node.parent;
    }
    const body = node?.userData.selectable as Selectable | undefined;
    if (body) this.selectBody(body);
    else this.clearSelection();
  }

  /* ================= 选中与相机聚焦 ================= */

  private selectBody(body: Selectable): void {
    this.selected = body;
    this.cameraRig.select(body);
    this.selectionMarker.visible = true;
    this.ui.syncSelectedId(body.id);
    this.refreshInfoPanel();
  }

  private handleSelectById(id: string): void {
    if (!id) {
      this.clearSelection();
      return;
    }
    const body = this.registry.find((item) => item.id === id);
    if (body) this.selectBody(body);
  }

  private clearSelection(): void {
    this.selected = null;
    this.cameraRig.clearFocus();
    this.selectionMarker.visible = false;
    this.ui.syncSelectedId('');
    this.ui.hideInfoPanel();
  }

  /** 高亮环跟随选中天体：位置同步、尺寸略大于实体、面向相机 */
  private updateSelectionMarker(): void {
    if (!this.selected) return;
    const worldPos = new THREE.Vector3();
    this.selected.object3d.getWorldPosition(worldPos);
    this.selectionMarker.position.copy(worldPos);
    this.selectionMarker.quaternion.copy(this.cameraRig.camera.quaternion);

    // 直接使用天体已知渲染半径，避免包围球把轴倾斜 / 辉光计入导致标记过大
    this.selectionMarker.scale.setScalar(this.selected.radius * 1.4);
  }

  /* ================= 控制面板动作 ================= */

  private handleSpeedChange(scale: number): void {
    this.time.setTimeScale(scale);
    this.ui.setPauseButton(this.time.paused);
  }

  private handleTogglePause(): void {
    const paused = this.time.togglePause();
    this.ui.setPauseButton(paused);
    // 暂停时滑块回到 0 位置以直观表达；继续时还原
    this.ui.setSpeedSlider(paused ? 0 : this.time.rawScale);
  }

  private handleReset(): void {
    this.sun.reset();
    for (const planet of this.planets) planet.reset();
    this.comet.reset();
    this.ui.showToast('所有天体已重置到初始位置');
    this.refreshInfoPanel();
  }

  private setOrbitLinesVisible(visible: boolean): void {
    for (const line of this.orbitLines) line.setVisible(visible);
  }

  /* ================= 信息面板 ================= */

  private refreshInfoPanel(): void {
    if (!this.selected) return;
    this.ui.updateInfoPanel(this.selected, this.selected.getDistanceToSun());
  }

  /* ================= 窗口自适应 ================= */

  private readonly handleResize = (): void => {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    this.renderer.setSize(width, height);
    this.composer.setSize(width, height);
    this.cameraRig.handleResize(width / height);
  };

  /* ================= 帧循环 ================= */

  start(): void {
    this.clock.start();
    const loop = (): void => {
      if (this.disposed) return;
      this.rafId = requestAnimationFrame(loop);

      // 限制单帧步长，切换标签页回来后不会出现跳变
      const delta = Math.min(this.clock.getDelta(), 0.05);
      const timeScale = this.time.timeScale;

      // 1) 天体运动
      this.sun.update(delta, timeScale);
      for (const planet of this.planets) planet.update(delta, timeScale);
      this.comet.update(delta, timeScale);

      // 2)【扩展点】日食 / 月食判断：
      //    遍历带卫星的行星，调用 detectEclipse(sun, planet, moon)，
      //    将返回的 'solar' | 'lunar' 推送到 UI 提示即可（见 simulation/eclipse.ts）。

      // 3) 相机跟随与 OrbitControls 阻尼
      this.cameraRig.update(delta);
      this.updateSelectionMarker();

      // 4) 信息面板节流刷新（距离等数值持续变化）
      this.infoTimer += delta;
      if (this.infoTimer >= INFO_REFRESH_INTERVAL) {
        this.infoTimer = 0;
        this.refreshInfoPanel();
      }

      // 5) 后期管线输出
      this.composer.render();
    };
    this.rafId = requestAnimationFrame(loop);
  }

  /** 资源释放（热更新 / 卸载场景时使用） */
  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.rafId);
    window.removeEventListener('resize', this.handleResize);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
