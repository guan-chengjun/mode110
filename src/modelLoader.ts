/**
 * GLB 模型加载器：
 * - 使用 three/addons 的 GLTFLoader 加载外部免费 GLB/GLTF 模型；
 * - 加载过程通过状态回调驱动页面内嵌加载提示（非 alert 弹窗）；
 * - 网络失败、跨域失败或解析异常时，自动回退到调用方提供的程序化几何体；
 * - 加载成功后把模型归一化（居中 + 缩放到目标半径），保证替换后尺寸一致。
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export interface LoadCallbacks {
  /** 某个模型开始加载 */
  onStart?: (label: string) => void;
  /** 全部任务结束（成功或失败） */
  onSettled?: () => void;
  /** 非阻塞提示（加载失败兜底说明） */
  onNotice?: (message: string) => void;
}

interface PendingTask {
  url: string;
  label: string;
  targetRadius: number;
  onLoaded: (model: THREE.Object3D) => void;
  onFallback: () => void;
}

/** 把任意模型居中并缩放到指定半径，替换程序化球体后外观尺寸保持一致 */
export function normalizeModel(root: THREE.Object3D, targetRadius: number): THREE.Object3D {
  const box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  const scale = (targetRadius * 2) / maxDim;

  root.position.sub(center); // 居中
  root.scale.setScalar(scale);

  // 统一阴影设置
  root.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
  });
  return root;
}

class ModelLoadManager {
  private loader = new GLTFLoader();
  private queue: PendingTask[] = [];
  private activeCount = 0;
  private callbacks: LoadCallbacks = {};

  setCallbacks(callbacks: LoadCallbacks): void {
    this.callbacks = callbacks;
  }

  /**
   * 排队加载一个天体模型。
   * 无 url 时直接走兜底，不产生网络请求。
   */
  enqueue(task: PendingTask): void {
    if (!task.url) {
      task.onFallback();
      return;
    }
    this.queue.push(task);
  }

  /** 依次处理队列（串行可避免大量并发请求占满连接） */
  async process(): Promise<void> {
    while (this.queue.length > 0) {
      const task = this.queue.shift()!;
      this.activeCount++;
      this.callbacks.onStart?.(task.label);
      try {
        const gltf = await this.loader.loadAsync(task.url);
        const normalized = normalizeModel(gltf.scene, task.targetRadius);
        task.onLoaded(normalized);
      } catch (error) {
        // 任何加载异常（404 / 跨域 / 解析失败）都静默回退，仅 toast 提示
        console.warn(`[ModelLoader] 「${task.label}」模型加载失败，使用程序化球体兜底:`, error);
        this.callbacks.onNotice?.(`「${task.label}」GLB 模型加载失败，已自动切换为程序化球体`);
        task.onFallback();
      } finally {
        this.activeCount--;
      }
    }
    this.callbacks.onSettled?.();
  }

  get pending(): number {
    return this.queue.length + this.activeCount;
  }
}

/** 全局单例，仿真初始化时统一调度 */
export const modelLoader = new ModelLoadManager();
