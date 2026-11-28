// vr-kit.js — 週日 VR 原型共用底座（Meta Quest 2 WebXR ＋ 平板／手機／電腦）
// 用法：每款遊戲把這個檔案的內容「原樣貼進」自己的 index.html（保持單一檔案），
// 再呼叫 createVR(THREE, {...})。three.js 由 loadThree() 依序嘗試三個來源載入。
//
// 設計原則
// - 一套程式兩種輸入：VR 用手把射線＋板機；平板／手機／電腦用拖曳轉視角＋點擊。
// - 所有文字與按鈕都畫在 3D 面板上（VR 裡看不到 HTML），平面模式也用同一套。
// - 舒適度：不做平滑移動；用「傳送點」移動、搖桿左右一次轉 30 度。
// - 測試掛鉤：window.__VR（模擬器自動測試用）。

export async function loadThree() {
  const srcs = [
    '../lib/three/three.module.min.js', // GitHub Pages 上的本地副本（學校網路擋 CDN 時仍可用）
    'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js',
    'https://unpkg.com/three@0.170.0/build/three.module.min.js',
  ];
  let last;
  for (const s of srcs) {
    try { return await import(s); } catch (e) { last = e; }
  }
  throw last;
}

export function createVR(THREE, opts = {}) {
  const o = Object.assign({
    container: document.body,
    background: 0x9fc6e8,
    fog: null,              // 例如 [0x9fc6e8, 8, 40]
    eyeHeight: 1.5,         // 平面模式的眼睛高度（VR 用真實身高）
    font: '"Noto Sans TC","Noto Sans CJK TC","PingFang TC","Microsoft JhengHei",sans-serif',
    vrButtonText: '🥽 進入 VR',
    onEnterVR: null, onExitVR: null,
  }, opts);

  // ---------- 地基：渲染器、場景、玩家 ----------
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType('local-floor');
  try { renderer.xr.setFoveation(1); } catch (e) {}
  const cv = renderer.domElement;
  cv.style.cssText = 'display:block;position:fixed;inset:0;width:100%;height:100%;touch-action:none;outline:none';
  o.container.appendChild(cv);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(o.background);
  if (o.fog) scene.fog = new THREE.Fog(o.fog[0], o.fog[1], o.fog[2]);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x667755, 2.2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(4, 8, 3); scene.add(sun);

  // rig＝玩家站的位置；傳送時移動 rig，轉身時轉 rig
  const rig = new THREE.Group(); scene.add(rig);
  const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 200);
  camera.position.set(0, o.eyeHeight, 0);
  rig.add(camera);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // ---------- 工具箱：文字面板 ----------
  function wrap(ctx, text, maxW) {
    const out = [];
    // 英數字整串不拆開；標點不放在行首
    const noStart = /^[，。、！？；：」』）》〉…,.!?;:)\]]/;
    for (const para of String(text).split('\n')) {
      const tokens = para.match(/[A-Za-z0-9][A-Za-z0-9.'%-]*|\s+|./gu) || [''];
      let line = '';
      for (const tk of tokens) {
        if (ctx.measureText(line + tk).width > maxW && line.trim() && !noStart.test(tk)) { out.push(line.trimEnd()); line = tk.trimStart(); }
        else line += tk;
      }
      out.push(line);
    }
    return out;
  }
  // panel({text, w, h, size, bg, color, align}) → Mesh，mesh.setText(t) 可更新
  function panel(p = {}) {
    const cfg = Object.assign({ text: '', w: 1.2, h: 0.6, size: 44, bg: 'rgba(250,248,240,0.95)', color: '#22302a', align: 'left', border: '#22302a', radius: 28 }, p);
    const ppm = 512; // 每公尺像素
    const c = document.createElement('canvas');
    c.width = Math.round(cfg.w * ppm); c.height = Math.round(cfg.h * ppm);
    const ctx = c.getContext('2d');
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(cfg.w, cfg.h), mat);
    mesh.setText = (t, extra = {}) => {
      Object.assign(cfg, extra); cfg.text = t;
      ctx.clearRect(0, 0, c.width, c.height);
      const r = cfg.radius;
      ctx.beginPath(); ctx.roundRect(4, 4, c.width - 8, c.height - 8, r);
      ctx.fillStyle = cfg.bg; ctx.fill();
      if (cfg.border) { ctx.lineWidth = 8; ctx.strokeStyle = cfg.border; ctx.stroke(); }
      ctx.fillStyle = cfg.color; ctx.font = `600 ${cfg.size}px ${o.font}`; ctx.textBaseline = 'top';
      const pad = cfg.size * 0.7, lh = cfg.size * 1.35;
      const lines = wrap(ctx, t, c.width - pad * 2);
      const total = lines.length * lh;
      let y = Math.max(pad, (c.height - total) / 2);
      for (const ln of lines) {
        const x = cfg.align === 'center' ? (c.width - ctx.measureText(ln).width) / 2 : pad;
        ctx.fillText(ln, x, y); y += lh;
      }
      tex.needsUpdate = true;
    };
    mesh.setText(cfg.text);
    return mesh;
  }

  // ---------- 守門：可互動物件 ----------
  const interactables = new Set();
  let selectCount = 0;
  // interact(obj, {name, onSelect, hover:true}) 讓物件可被手把射線或點擊選取
  function interact(obj, cfg = {}) {
    obj.userData.vr = Object.assign({ name: obj.name || 'obj', enabled: true, hover: true }, cfg);
    interactables.add(obj);
    return obj;
  }
  function unInteract(obj) { interactables.delete(obj); }
  function rootOf(hitObj) {
    let x = hitObj;
    while (x) { if (interactables.has(x)) return x; x = x.parent; }
    return null;
  }
  function isShown(obj) { let x = obj; while (x) { if (!x.visible) return false; x = x.parent; } return true; }
  const ray = new THREE.Raycaster(); ray.far = 30;
  function pick() {
    const list = [...interactables].filter(x => x.userData.vr.enabled && isShown(x));
    const hits = ray.intersectObjects(list, true);
    for (const h of hits) { const r = rootOf(h.object); if (r) return { obj: r, point: h.point }; }
    return null;
  }
  function fire(obj) {
    if (!obj || !obj.userData.vr.enabled) return;
    selectCount++;
    pulse(obj);
    try { obj.userData.vr.onSelect && obj.userData.vr.onSelect(obj); } catch (e) { console.error(e); }
  }
  // 選取時物件縮放一下當回饋
  const pulses = [];
  function pulse(obj) { pulses.push({ obj, t: 0, s: obj.scale.clone() }); }

  // 3D 按鈕
  function button(label, onSelect, p = {}) {
    const m = panel(Object.assign({ text: label, w: 0.5, h: 0.16, size: 40, align: 'center', bg: '#e9a51b', radius: 36 }, p));
    m.name = p.name || 'btn:' + label;
    interact(m, { name: m.name, onSelect });
    return m;
  }

  // ---------- 入口：對話框（放在玩家目前視線前方，世界固定，不黏在臉上） ----------
  let dialog = null;
  function placeInFront(obj, dist = 1.4, dy = -0.1) {
    const p = new THREE.Vector3(), q = new THREE.Quaternion();
    camera.getWorldPosition(p); camera.getWorldQuaternion(q);
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(q); fwd.y = 0;
    if (fwd.lengthSq() < 1e-4) fwd.set(0, 0, -1);
    fwd.normalize();
    obj.position.copy(p).addScaledVector(fwd, dist); obj.position.y = p.y + dy;
    obj.lookAt(p.x, obj.position.y, p.z);
  }
  // say(text, buttons=[{label, onSelect}]) → 顯示對話框；按鈕按下自動關閉
  function say(text, buttons = [{ label: '好', onSelect: null }], p = {}) {
    closeDialog();
    const g = new THREE.Group(); g.name = 'dialog';
    const { footer, ...pp } = p;
    const body = panel(Object.assign({ text, w: 1.1, h: 0.55, size: 38 }, pp));
    g.add(body);
    const bodyH = body.geometry.parameters.height, btnY = -bodyH / 2 - 0.1;
    const n = buttons.length, bw = Math.min(0.5, 1.0 / n - 0.04);
    buttons.forEach((b, i) => {
      const btn = button(b.label, () => { closeDialog(); b.onSelect && b.onSelect(); }, { w: bw, name: 'dlg:' + b.label, size: bw < 0.4 ? 32 : 40 });
      btn.position.set((i - (n - 1) / 2) * (bw + 0.04), btnY, 0.01);
      g.add(btn);
    });
    if (footer) {
      const f = panel({ text: footer, w: 1.1, h: 0.1, size: 24, align: 'center', border: null, bg: 'rgba(255,255,255,0.75)' });
      f.position.set(0, btnY - 0.16, 0.01); g.add(f);
    }
    scene.add(g); placeInFront(g); dialog = g;
    return g;
  }
  // intro({title, text, startLabel, onStart}) 開場畫面：署名只出現在這裡，按「開始」後就消失、遊戲中不再出現
  const SIGNATURE = '本遊戲由Peiching開發，角色與情境均為虛構';
  function intro(c = {}) {
    const label = c.startLabel || '開始';
    return say(`${c.title || ''}\n${c.text || ''}`.trim(), [{ label, onSelect: c.onStart }], { h: c.h || 0.6, size: c.size || 38, footer: SIGNATURE });
  }
  function closeDialog() {
    if (!dialog) return;
    dialog.traverse(x => { if (interactables.has(x)) interactables.delete(x); });
    scene.remove(dialog); dialog = null;
  }

  // ---------- 移動：傳送點 ----------
  const hotspots = [];
  // hotspot(x, z, {label}) 地上的圓圈，選它就走過去
  function hotspot(x, z, cfg = {}) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.name = cfg.name || `spot:${x},${z}`;
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.4, 32), new THREE.MeshBasicMaterial({ color: 0x3c7fa6, transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02; g.add(ring);
    const hit = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.06, 16), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.y = 0.03; g.add(hit);
    if (cfg.label) { const t = panel({ text: cfg.label, w: 0.6, h: 0.14, size: 36, align: 'center' }); t.position.y = 0.5; g.add(t); g.userData.labelMesh = t; }
    scene.add(g); hotspots.push(g);
    interact(g, { name: g.name, onSelect: () => { teleport(x, z, cfg.face); cfg.onArrive && cfg.onArrive(); } });
    return g;
  }
  // 傳送：把 rig 移到 (x,z)，VR 中會扣掉頭在遊玩區的偏移
  function teleport(x, z, faceYaw) {
    const head = new THREE.Vector3(); camera.getWorldPosition(head);
    const dx = x - head.x, dz = z - head.z;
    rig.position.x += dx; rig.position.z += dz;
    if (typeof faceYaw === 'number') turnTo(faceYaw);
    hotspots.forEach(h => { h.visible = Math.hypot(h.position.x - x, h.position.z - z) > 0.6; });
  }
  function turn(rad) {
    // 繞頭的位置轉，避免轉身時人被甩出去
    const head = new THREE.Vector3(); camera.getWorldPosition(head);
    rig.position.sub(head).applyAxisAngle(new THREE.Vector3(0, 1, 0), rad).add(head);
    rig.rotation.y += rad;
  }
  function turnTo(yaw) { const cur = rig.rotation.y + (renderer.xr.isPresenting ? 0 : flatYaw); turn(yaw - cur); }

  // ---------- 輸入一：VR 手把 ----------
  const controllers = [];
  const rayGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]);
  for (let i = 0; i < 2; i++) {
    const c = renderer.xr.getController(i);
    const line = new THREE.Line(rayGeo, new THREE.LineBasicMaterial({ color: 0xffffff }));
    line.scale.z = 4; c.add(line);
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.015, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffdd55 }));
    dot.visible = false; scene.add(dot);
    c.userData = { line, dot, hover: null, snapReady: true, source: null };
    c.addEventListener('connected', e => { c.userData.source = e.data; });
    c.addEventListener('disconnected', () => { c.userData.source = null; });
    c.addEventListener('selectstart', () => { aimFrom(c); const h = pick(); if (h) fire(h.obj); });
    rig.add(c); controllers.push(c);
    const grip = renderer.xr.getControllerGrip(i);
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.03, 0.12), new THREE.MeshStandardMaterial({ color: 0x333333 }));
    body.position.z = 0.03; grip.add(body); rig.add(grip);
  }
  const tmpM = new THREE.Matrix4();
  function aimFrom(c) {
    tmpM.identity().extractRotation(c.matrixWorld);
    ray.ray.origin.setFromMatrixPosition(c.matrixWorld);
    ray.ray.direction.set(0, 0, -1).applyMatrix4(tmpM);
  }

  // ---------- 輸入二：平板／手機／電腦 ----------
  let flatYaw = 0, flatPitch = 0, drag = null, hoverFlat = null;
  const ndc = new THREE.Vector2();
  function aimFromScreen(x, y) {
    ndc.set((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, camera);
  }
  cv.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: 0 }; try { cv.setPointerCapture(e.pointerId); } catch (err) {} });
  cv.addEventListener('pointermove', e => {
    if (drag) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY;
      drag.moved += Math.abs(dx) + Math.abs(dy);
      flatYaw += dx * 0.005; flatPitch = Math.max(-1.2, Math.min(1.2, flatPitch + dy * 0.005));
    } else if (e.pointerType === 'mouse') {
      aimFromScreen(e.clientX, e.clientY); const h = pick(); hoverFlat = h ? h.obj : null;
      cv.style.cursor = hoverFlat ? 'pointer' : 'grab';
    }
  });
  cv.addEventListener('pointerup', e => {
    if (drag && drag.moved < 12) { aimFromScreen(e.clientX, e.clientY); const h = pick(); if (h) fire(h.obj); }
    drag = null;
  });
  cv.addEventListener('pointercancel', () => { drag = null; });
  window.addEventListener('keydown', e => {
    if (renderer.xr.isPresenting) return;
    if (e.key === 'ArrowLeft' || e.key === 'a') flatYaw += 0.15;
    if (e.key === 'ArrowRight' || e.key === 'd') flatYaw -= 0.15;
    if (e.key === 'ArrowUp' || e.key === 'w') flatPitch = Math.min(1.2, flatPitch + 0.1);
    if (e.key === 'ArrowDown' || e.key === 's') flatPitch = Math.max(-1.2, flatPitch - 0.1);
    if (e.key === ' ' || e.key === 'Enter') { aimFromScreen(window.innerWidth / 2, window.innerHeight / 2); const h = pick(); if (h) fire(h.obj); }
  });

  // ---------- 入口：進入 VR 按鈕＋平面模式提示 ----------
  const ui = document.createElement('div');
  ui.style.cssText = 'position:fixed;left:0;right:0;bottom:max(16px,env(safe-area-inset-bottom));display:flex;justify-content:center;gap:10px;pointer-events:none;z-index:5;font-family:' + o.font;
  const vrBtn = document.createElement('button');
  vrBtn.textContent = o.vrButtonText; vrBtn.hidden = true; vrBtn.id = 'enterVR';
  vrBtn.style.cssText = 'pointer-events:auto;font:700 18px ' + o.font + ';padding:12px 22px;border-radius:12px;border:2px solid #22302a;background:#e9a51b;color:#22302a;box-shadow:0 3px 0 #22302a;min-height:48px';
  const tip = document.createElement('div');
  tip.textContent = '拖曳轉頭看四周，點一下物件或藍色圓圈';
  tip.style.cssText = 'pointer-events:none;align-self:center;background:rgba(34,48,42,.75);color:#fff;padding:8px 14px;border-radius:20px;font-size:14px';
  ui.append(vrBtn, tip); document.body.appendChild(ui);
  let session = null;
  if (navigator.xr && navigator.xr.isSessionSupported) {
    navigator.xr.isSessionSupported('immersive-vr').then(ok => { if (ok) vrBtn.hidden = false; }).catch(() => {});
  }
  vrBtn.onclick = async () => {
    if (session) { session.end(); return; }
    try {
      session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'] });
      session.addEventListener('end', () => {
        session = null; vrBtn.textContent = o.vrButtonText; tip.hidden = false;
        camera.position.set(0, o.eyeHeight, 0); o.onExitVR && o.onExitVR();
      });
      await renderer.xr.setSession(session);
      vrBtn.textContent = '離開 VR'; tip.hidden = true;
      // 進 VR 後頭的高度會變，把還開著的對話框（例如開場畫面）重新放到眼前
      replaceAt = xrFrames + 10;
      o.onEnterVR && o.onEnterVR();
    } catch (err) { console.error(err); session = null; }
  };

  // ---------- 迴圈 ----------
  const updaters = [];
  const clock = new THREE.Clock();
  let xrFrames = 0, frames = 0, replaceAt = -1;
  renderer.setAnimationLoop((t, xrFrame) => {
    const dt = Math.min(0.05, clock.getDelta());
    frames++;
    if (renderer.xr.isPresenting) {
      xrFrames++;
      // 進 VR 約 10 幀後頭的位置才穩定，這時再把開著的對話框移到眼前
      if (xrFrames === replaceAt) { if (dialog) placeInFront(dialog); replaceAt = -1; }
      for (const c of controllers) {
        aimFrom(c); const h = c.visible ? pick() : null;
        c.userData.hover = h ? h.obj : null;
        c.userData.line.scale.z = h ? ray.ray.origin.distanceTo(h.point) : 4;
        c.userData.dot.visible = !!h; if (h) c.userData.dot.position.copy(h.point);
        // 搖桿左右：一次轉 30 度（舒適轉向）
        const gp = c.userData.source && c.userData.source.gamepad;
        if (gp && gp.axes && gp.axes.length >= 4) {
          const ax = gp.axes[2];
          if (Math.abs(ax) > 0.7 && c.userData.snapReady) { turn(ax > 0 ? -Math.PI / 6 : Math.PI / 6); c.userData.snapReady = false; }
          if (Math.abs(ax) < 0.3) c.userData.snapReady = true;
        }
      }
    } else {
      camera.rotation.set(flatPitch, flatYaw, 0, 'YXZ');
    }
    // 滑過高亮
    const hovered = new Set(controllers.map(c => c.userData.hover).filter(Boolean));
    if (hoverFlat) hovered.add(hoverFlat);
    for (const it of interactables) {
      if (!it.userData.vr.hover) continue;
      const s = hovered.has(it) ? 1.06 : 1;
      if (!pulses.some(p => p.obj === it)) it.scale.setScalar(it.userData.baseScale ?? (it.userData.baseScale = it.scale.x)).multiplyScalar(s);
    }
    for (let i = pulses.length - 1; i >= 0; i--) {
      const p = pulses[i]; p.t += dt;
      const k = 1 + 0.15 * Math.sin(Math.min(1, p.t / 0.25) * Math.PI);
      p.obj.scale.copy(p.s).multiplyScalar(k);
      if (p.t >= 0.25) { p.obj.scale.copy(p.s); pulses.splice(i, 1); }
    }
    for (const f of updaters) { try { f(dt, t); } catch (e) { console.error(e); } }
    renderer.render(scene, camera);
  });

  const app = {
    THREE, scene, camera, renderer, rig, controllers,
    panel, button, interact, unInteract, say, intro, closeDialog, hotspot, teleport, turn, turnTo, placeInFront,
    onUpdate: f => updaters.push(f),
    isXR: () => renderer.xr.isPresenting,
    get dialog() { return dialog; },
  };

  // ---------- 測試積木：給模擬器與自動測試用 ----------
  window.__VR = {
    app,
    get selectCount() { return selectCount; },
    get xrFrames() { return xrFrames; },
    get frames() { return frames; },
    get presenting() { return renderer.xr.isPresenting; },
    names: () => [...interactables].filter(x => x.userData.vr.enabled && isShown(x)).map(x => x.userData.vr.name),
    select(name) { const it = [...interactables].find(x => x.userData.vr.name === name && x.userData.vr.enabled && isShown(x)); if (!it) throw new Error('找不到可選物件：' + name); fire(it); },
    worldPos(name) { const it = [...interactables].find(x => x.userData.vr.name === name); if (!it) return null; const b = new THREE.Box3().setFromObject(it); const c = b.getCenter(new THREE.Vector3()); return [c.x, c.y, c.z]; },
    // 把 rig 座標系中的點，轉成 rig 本地座標（模擬器控制器的座標是相對 rig 的）
    toRig(x, y, z) { const v = new THREE.Vector3(x, y, z); rig.worldToLocal(v); return [v.x, v.y, v.z]; },
    // 物件中心在螢幕上的位置（CSS 像素），不在畫面內回傳 null
    screenPos(name) { const p = this.worldPos(name); if (!p) return null; const v = new THREE.Vector3(...p).project(camera); if (v.z > 1 || Math.abs(v.x) > 0.95 || Math.abs(v.y) > 0.95) return null; return [(v.x + 1) / 2 * window.innerWidth, (1 - v.y) / 2 * window.innerHeight]; },
    lookQuat(from, to) { const m = new THREE.Matrix4().lookAt(new THREE.Vector3(...from), new THREE.Vector3(...to), new THREE.Vector3(0, 1, 0)); const q = new THREE.Quaternion().setFromRotationMatrix(m); return [q.x, q.y, q.z, q.w]; },
  };
  return app;
}
