/**
 * 开发期冒烟测试（非生产代码）：
 * 通过 Chrome DevTools Protocol 驱动页面，验证帧循环、选中、暂停、重置、开关。
 */
const base = 'http://127.0.0.1:9222';

async function getPageTarget() {
  const res = await fetch(`${base}/json`);
  const targets = await res.json();
  return targets.find((t) => t.type === 'page');
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const target = await getPageTarget();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve) => (ws.onopen = resolve));

  let id = 0;
  const pending = new Map();
  const events = [];
  ws.onmessage = (msg) => {
    const data = JSON.parse(msg.data);
    if (data.id && pending.has(data.id)) {
      pending.get(data.id)(data);
      pending.delete(data.id);
    } else if (data.method) {
      events.push(data);
    }
  };

  function send(method, params = {}) {
    const mid = ++id;
    ws.send(JSON.stringify({ id: mid, method, params }));
    return new Promise((resolve) => pending.set(mid, resolve));
  }

  function evaluate(expression) {
    return send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true
    });
  }

  const failures = [];
  function check(name, cond, detail) {
    if (cond) console.log(`PASS  ${name}`);
    else {
      console.log(`FAIL  ${name}  ${detail ?? ''}`);
      failures.push(name);
    }
  }

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Page.navigate', { url: 'http://localhost:5174/' });
  await sleep(3500); // 等待场景初始化与首帧

  // 控制台错误收集
  const consoleErrors = events
    .filter((e) => e.method === 'Runtime.exceptionThrown' ||
      (e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error'))
    .map((e) => JSON.stringify(e.params).slice(0, 200));
  check('无运行时异常 / console.error', consoleErrors.length === 0, consoleErrors.join(' | '));

  // 1) 天体注册表与场景对象
  const r1 = await evaluate(`(() => {
    const sim = window.__solarSim;
    if (!sim) return null;
    return {
      registry: sim.registry.length,
      planets: sim.planets.length,
      hasComet: !!sim.comet,
      canvas: !!document.querySelector('#scene-container canvas'),
      infoHidden: document.getElementById('info-panel').classList.contains('hidden')
    };
  })()`);
  const init = r1.result.result.value;
  check('仿真实例已挂载', !!init, JSON.stringify(r1.result));
  check('注册天体数量 = 太阳+8行星+4卫星+彗星 = 14', init.registry === 14, `got ${init.registry}`);
  check('行星数量为 8', init.planets === 8, `got ${init.planets}`);
  check('画布已创建', init.canvas === true);
  check('初始无选中时信息面板隐藏', init.infoHidden === true);

  // 2) 动画推进：记录地球角度，等待后应发生变化
  const before = await evaluate(`window.__solarSim.planets.find(p=>p.id==='earth').currentAngle`);
  await sleep(900);
  const after = await evaluate(`window.__solarSim.planets.find(p=>p.id==='earth').currentAngle`);
  check('帧循环驱动公转角度推进', Math.abs(after.result.result.value - before.result.result.value) > 0.1);

  // 3) 暂停：角度不再变化
  await evaluate(`document.getElementById('btn-pause').click()`);
  const p1 = await evaluate(`window.__solarSim.planets.find(p=>p.id==='mars').currentAngle`);
  await sleep(600);
  const p2 = await evaluate(`window.__solarSim.planets.find(p=>p.id==='mars').currentAngle`);
  check('暂停后天体静止', p1.result.result.value === p2.result.result.value);
  const pauseLabel = await evaluate(`document.getElementById('btn-pause').textContent`);
  check('暂停按钮文案切换为「继续」', pauseLabel.result.result.value === '继续');
  await evaluate(`document.getElementById('btn-pause').click()`); // 恢复

  // 4) 选中地球：相机聚焦、信息面板显示正确数据
  await evaluate(`(() => {
    const sel = document.getElementById('body-select');
    sel.value = 'earth';
    sel.dispatchEvent(new Event('change'));
  })()`);
  // 轮询等待相机切入真正完成（低帧率下比固定 sleep 更可靠），最多 5 秒
  let docked = false;
  for (let i = 0; i < 25; i++) {
    await sleep(200);
    const state = await evaluate(`(() => ({
      docking: window.__solarSim.cameraRig.docking,
      dist: window.__solarSim.cameraRig.camera.position.distanceTo(window.__solarSim.cameraRig.controls.target),
      desired: window.__solarSim.cameraRig.desiredDistance
    }))()`);
    const v = state.result.result.value;
    if (v.docking === false) {
      docked = true;
      break;
    }
  }
  check('相机切入在 5 秒内完成', docked);
  const sel = await evaluate(`(() => ({
    selectedId: window.__solarSim.selected?.id,
    markerVisible: window.__solarSim.selectionMarker.visible,
    infoShown: !document.getElementById('info-panel').classList.contains('hidden'),
    name: document.getElementById('info-name').textContent,
    distance: document.getElementById('info-distance').textContent,
    orbitSpeed: document.getElementById('info-orbit-speed').textContent
  }))()`);
  // 相机距离单独取：对比实际距离与该天体的期望聚焦距离
  const cam = await evaluate(`(() => {
    const sim = window.__solarSim;
    const rig = sim.cameraRig;
    const cam = rig.camera;
    const tgt = rig.controls.target;
    const targetWorld = new (cam.position.constructor)();
    sim.selected.object3d.getWorldPosition(targetWorld);
    return {
      distToTarget: cam.position.distanceTo(tgt),
      distToBody: cam.position.distanceTo(targetWorld),
      desiredDistance: rig.desiredDistance,
      docking: rig.docking,
      focusId: rig.focused?.id
    };
  })()`);
  const sv = sel.result.result.value;
  check('选中地球成功', sv.selectedId === 'earth');
  check('高亮环显示', sv.markerVisible === true);
  check('信息面板显示且名称为地球', sv.infoShown === true && sv.name === '地球', JSON.stringify(sv));
  check('面板含实时距离（AU）', sv.distance.includes('AU'), sv.distance);
  check('面板显示公转速度', sv.orbitSpeed.includes('°/s'), sv.orbitSpeed);
  const cv = cam.result.result.value;
  check('相机聚焦目标为地球', cv.focusId === 'earth');
  // 切入完成后实际距离应收拢到期望聚焦距离附近（容差 1.5 单位）
  check('相机已平滑移动到地球附近',
    Math.abs(cv.distToTarget - cv.desiredDistance) < 1.5,
    `dist=${cv.distToTarget.toFixed(2)}, desired=${cv.desiredDistance.toFixed(2)}, docking=${cv.docking}`);

  // 5) 轨道线开关
  await evaluate(`(() => { const c=document.getElementById('chk-orbits'); c.checked=false; c.dispatchEvent(new Event('change')); })()`);
  const orbHidden = await evaluate(`window.__solarSim.orbitLines.every(l=>!l.object3d.visible)`);
  check('关闭轨道线后全部隐藏', orbHidden.result.result.value === true);
  await evaluate(`(() => { const c=document.getElementById('chk-orbits'); c.checked=true; c.dispatchEvent(new Event('change')); })()`);

  // 6) 彗星开关与拖尾（通过公开 API 访问，TS 私有字段在运行时为压缩属性名）
  const cometExpr = `window.__solarSim.registry.find(b=>b.id==='halley')`;
  const trailBefore = await evaluate(`${cometExpr}.getTrailObject().visible`);
  await evaluate(`(() => { const c=document.getElementById('chk-comet'); c.checked=false; c.dispatchEvent(new Event('change')); })()`);
  const cometHidden = await evaluate(`(() => {
    const comet = ${cometExpr};
    return {
      enabled: comet.effectEnabled,
      trail: comet.getTrailObject().visible,
      orbit: comet.orbitLine.object3d.visible
    };
  })()`);
  const ch = cometHidden.result.result.value;
  check('关闭彗星后效果开关关闭且拖尾/轨道隐藏', ch.enabled === false && ch.trail === false && ch.orbit === false, JSON.stringify(ch));
  check('拖尾默认开启', trailBefore.result.result.value === true);
  await evaluate(`(() => { const c=document.getElementById('chk-comet'); c.checked=true; c.dispatchEvent(new Event('change')); })()`);

  // 7) 时间流速滑块
  await evaluate(`(() => { const s=document.getElementById('speed-slider'); s.value='5'; s.dispatchEvent(new Event('input')); })()`);
  const scale = await evaluate(`window.__solarSim.time.rawScale`);
  check('滑块调整时间流速到 5×', scale.result.result.value === 5);

  // 8) 重置：所有行星回到初始相位
  await evaluate(`document.getElementById('btn-reset').click()`);
  const resetOk = await evaluate(`window.__solarSim.planets.every(p => Math.abs(p.currentAngle - p.initialAngle) < 1e-9)`);
  check('重置后行星回到初始角度', resetOk.result.result.value === true);

  // 9) 窗口 resize 自适应
  await send('Emulation.setDeviceMetricsOverride', { width: 1024, height: 700, deviceScaleFactor: 1, mobile: false });
  await sleep(300);
  const resize = await evaluate(`(() => {
    const c = document.querySelector('#scene-container canvas');
    return { w: c.width, h: c.height };
  })()`);
  const rv = resize.result.result.value;
  check('窗口尺寸变化后画布自适应', rv.w > 0 && rv.h > 0, JSON.stringify(rv));

  console.log(failures.length === 0 ? '\n全部冒烟测试通过 ✔' : `\n${failures.length} 项失败 �’`);
  ws.close();
  process.exit(failures.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('测试脚本异常:', e);
  process.exit(2);
});
