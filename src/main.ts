/**
 * 应用入口：
 * 纯前端启动，无后端依赖。DOM 就绪后挂载 Simulation 并启动帧循环，
 * 全程不产生 alert/confirm 等阻断式弹窗。
 */
import './styles.css';
import { Simulation } from './Simulation';

function bootstrap(): void {
  const container = document.getElementById('scene-container');
  if (!container) {
    throw new Error('找不到 #scene-container 挂载节点');
  }

  const simulation = new Simulation(container);
  simulation.start();

  // 便于控制台调试（不影响生产逻辑）
  if (import.meta.env.DEV) {
    (window as unknown as { __solarSim?: Simulation }).__solarSim = simulation;
  }
}

// 模块脚本默认 defer，DOM 已解析完成，直接启动即可
bootstrap();
