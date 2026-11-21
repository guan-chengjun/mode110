/**
 * 界面控制层：
 * 集中管理 DOM 引用与事件分发，Simulation 只通过回调与本类通信，
 * 保持渲染逻辑与界面逻辑解耦。所有提示均为内嵌元素，不使用 alert/confirm 弹窗。
 */
import type { BodyInfo, Selectable } from '../types';
import { AU_IN_UNITS, KM_PER_AU } from '../data/bodiesData';

export interface UiCallbacks {
  onSpeedChange: (scale: number) => void;
  onTogglePause: () => void;
  onReset: () => void;
  onToggleOrbits: (visible: boolean) => void;
  onToggleComet: (visible: boolean) => void;
  onSelectBody: (id: string) => void;
}

export class UiController {
  private readonly el = {
    loading: document.getElementById('loading')!,
    loadingText: document.getElementById('loading-text')!,
    toast: document.getElementById('toast')!,
    infoPanel: document.getElementById('info-panel')!,
    infoName: document.getElementById('info-name')!,
    infoType: document.getElementById('info-type')!,
    infoOrbitSpeed: document.getElementById('info-orbit-speed')!,
    infoSpinSpeed: document.getElementById('info-spin-speed')!,
    infoDistance: document.getElementById('info-distance')!,
    speedSlider: document.getElementById('speed-slider') as HTMLInputElement,
    speedValue: document.getElementById('speed-value')!,
    btnPause: document.getElementById('btn-pause') as HTMLButtonElement,
    btnReset: document.getElementById('btn-reset') as HTMLButtonElement,
    chkOrbits: document.getElementById('chk-orbits') as HTMLInputElement,
    chkComet: document.getElementById('chk-comet') as HTMLInputElement,
    bodySelect: document.getElementById('body-select') as HTMLSelectElement,
  };

  private toastTimer: number | undefined;

  constructor(private readonly callbacks: UiCallbacks) {
    this.bindEvents();
  }

  private bindEvents(): void {
    this.el.speedSlider.addEventListener('input', () => {
      const scale = parseFloat(this.el.speedSlider.value);
      this.el.speedValue.textContent = `${scale.toFixed(1)}×`;
      this.callbacks.onSpeedChange(scale);
    });

    this.el.btnPause.addEventListener('click', () => this.callbacks.onTogglePause());
    this.el.btnReset.addEventListener('click', () => this.callbacks.onReset());
    this.el.chkOrbits.addEventListener('change', () =>
      this.callbacks.onToggleOrbits(this.el.chkOrbits.checked)
    );
    this.el.chkComet.addEventListener('change', () =>
      this.callbacks.onToggleComet(this.el.chkComet.checked)
    );
    this.el.bodySelect.addEventListener('change', () =>
      this.callbacks.onSelectBody(this.el.bodySelect.value)
    );
  }

  /** 填充天体下拉选项（在天体注册表构建完成后调用一次） */
  populateBodyOptions(bodies: Selectable[]): void {
    for (const body of bodies) {
      const option = document.createElement('option');
      option.value = body.id;
      option.textContent = body.name;
      this.el.bodySelect.appendChild(option);
    }
  }

  /** 下拉框与场景点击选中状态同步 */
  syncSelectedId(id: string): void {
    this.el.bodySelect.value = id;
  }

  showLoading(text: string): void {
    this.el.loadingText.textContent = text;
    this.el.loading.classList.remove('hidden');
  }

  hideLoading(): void {
    this.el.loading.classList.add('hidden');
  }

  /** 非阻塞 toast，3.5 秒自动消失 */
  showToast(message: string): void {
    this.el.toast.textContent = message;
    this.el.toast.classList.remove('hidden');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.el.toast.classList.add('hidden'), 3500);
  }

  /** 暂停按钮文案同步 */
  setPauseButton(paused: boolean): void {
    this.el.btnPause.textContent = paused ? '继续' : '暂停';
  }

  /** 滑块与数值同步（暂停 / 程序化设置时） */
  setSpeedSlider(scale: number): void {
    this.el.speedSlider.value = String(scale);
    this.el.speedValue.textContent = `${scale.toFixed(1)}×`;
  }

  /**
   * 刷新信息面板。
   * @param body       选中天体
   * @param distance   实时距太阳距离（仿真单位）
   * @param paused     是否暂停（暂停时仍显示最后状态）
   */
  updateInfoPanel(body: Selectable, distance: number): void {
    const info: BodyInfo = body.getBodyInfo();
    this.el.infoPanel.classList.remove('hidden');
    this.el.infoName.textContent = info.name;
    this.el.infoType.textContent = info.typeLabel;
    this.el.infoOrbitSpeed.textContent =
      info.orbitSpeed === 0 ? '—（恒星）' : `${info.orbitSpeed.toFixed(2)} °/s`;
    this.el.infoSpinSpeed.textContent = `${info.spinSpeed.toFixed(2)} °/s`;

    // 距离同时显示仿真单位与折算的天文单位 / 公里
    const au = distance / AU_IN_UNITS;
    const km = au * KM_PER_AU;
    this.el.infoDistance.textContent =
      distance === 0
        ? '0（位于太阳系中心）'
        : `${distance.toFixed(2)} 单位 / ${au.toFixed(2)} AU / ${this.formatKm(km)}`;
  }

  hideInfoPanel(): void {
    this.el.infoPanel.classList.add('hidden');
  }

  private formatKm(km: number): string {
    if (km >= 1e8) return `${(km / 1e8).toFixed(2)} 亿 km`;
    if (km >= 1e4) return `${(km / 1e4).toFixed(1)} 万 km`;
    return `${km.toFixed(0)} km`;
  }
}
