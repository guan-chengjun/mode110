/**
 * 全局时间流速控制。
 * 所有天体的运动增量都乘以 timeScale：
 * - 0      → 暂停
 * - 0~1    → 慢放
 * - 1      → 正常
 * - 1~10   → 快进
 */
export class TimeController {
  private _timeScale = 1;
  private _paused = false;
  /** 暂停前的流速，恢复时还原 */
  private scaleBeforePause = 1;

  get timeScale(): number {
    return this._paused ? 0 : this._timeScale;
  }

  /** 面板滑块设置流速（设置正值时自动解除暂停） */
  setTimeScale(scale: number): void {
    this._timeScale = Math.max(0, scale);
    if (this._timeScale > 0) {
      this._paused = false;
      this.scaleBeforePause = this._timeScale;
    }
  }

  get rawScale(): number {
    return this._timeScale;
  }

  get paused(): boolean {
    return this._paused;
  }

  /** 暂停 / 继续切换，返回切换后的暂停状态 */
  togglePause(): boolean {
    if (this._paused) {
      this._paused = false;
      this._timeScale = this.scaleBeforePause || 1;
    } else {
      this.scaleBeforePause = this._timeScale || 1;
      this._paused = true;
    }
    return this._paused;
  }

  /** 暂停状态下由按钮强制恢复 */
  resume(): void {
    if (this._paused) {
      this._paused = false;
      this._timeScale = this.scaleBeforePause || 1;
    }
  }
}
