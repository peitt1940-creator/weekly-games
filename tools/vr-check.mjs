// 週日 VR 原型自動檢查
// 用法：node tools/vr-check.mjs <資料夾名稱>      例如：node tools/vr-check.mjs vr-test
//
// 檢查項目
//  1. 電腦、平板、手機三種畫面：能載入、畫面有在跑、沒有 JS 錯誤、用真的點擊（不是程式呼叫）點得到物件
//  2. 平面模式：照 window.__GAME.nextTarget() 一步步點，能走到結局
//  3. 模擬 Meta Quest 2（Meta 官方 IWER 模擬器）：出現「進入 VR」按鈕、按下後真的進入 immersive-vr、
//     VR 畫面持續更新，並且用「模擬右手把射線＋板機」一步步點到結局
// 結果印成 JSON；有任何一項失敗就以代碼 1 結束。
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { dirname, join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const folder = process.argv[2];
if (!folder || !existsSync(join(root, folder, 'index.html'))) { console.error('找不到', folder, '/index.html'); process.exit(1); }

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.css': 'text/css', '.glb': 'model/gltf-binary', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const server = createServer((req, res) => {
  let p = normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
  let f = join(root, p);
  if (existsSync(f) && statSync(f).isDirectory()) f = join(f, 'index.html');
  if (!f.startsWith(root) || !existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' }); res.end(readFileSync(f));
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/${folder}/`;
const iwerSrc = readFileSync(join(root, 'tools/iwer.min.js'), 'utf8');

const report = { folder, flat: {}, xr: {}, ok: true, problems: [] };
const fail = (msg) => { report.ok = false; report.problems.push(msg); };
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

function watchErrors(page, bag) {
  page.on('pageerror', e => bag.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) bag.push('console: ' + m.text()); });
  page.on('requestfailed', r => { if (!/favicon|fonts\.g|jsdelivr|unpkg/.test(r.url())) bag.push('requestfailed: ' + r.url()); });
}
async function waitFrames(page, key, n, ms = 20000) {
  await page.waitForFunction(([k, n]) => window.__VR && window.__VR[k] >= n, [key, n], { timeout: ms });
}

// ---------- 1 & 2：平面裝置 ----------
const flatDevices = {
  電腦: { viewport: { width: 1280, height: 800 } },
  平板: devices['Galaxy Tab S4'] || { viewport: { width: 712, height: 1138 }, isMobile: true, hasTouch: true },
  手機: devices['Pixel 7'] || { viewport: { width: 412, height: 839 }, isMobile: true, hasTouch: true },
};
for (const [label, dev] of Object.entries(flatDevices)) {
  const r = report.flat[label] = {};
  const ctx = await browser.newContext({ ...dev });
  const page = await ctx.newPage(); const errs = [];
  watchErrors(page, errs);
  try {
    await page.goto(base, { waitUntil: 'load' });
    await waitFrames(page, 'frames', 20);
    r.title = await page.title();
    r.interactables = await page.evaluate(() => __VR.names().length);
    if (!r.interactables) fail(`${label}：場景裡沒有可以點的東西`);
    // 用真的點擊：找一個在畫面內的物件
    const target = await page.evaluate(() => { for (const n of __VR.names()) { const p = __VR.screenPos(n); if (p) return { n, p }; } return null; });
    if (target) {
      const before = await page.evaluate(() => __VR.selectCount);
      if (dev.hasTouch) await page.touchscreen.tap(target.p[0], target.p[1]); else await page.mouse.click(target.p[0], target.p[1]);
      await page.waitForTimeout(150);
      const after = await page.evaluate(() => __VR.selectCount);
      r.realTap = after > before ? `點到「${target.n}」` : `點了「${target.n}」但沒反應`;
      if (after <= before) fail(`${label}：用手指／滑鼠點物件沒有反應`);
    } else { r.realTap = '開場畫面內沒有可點物件'; fail(`${label}：開場視野內看不到任何可點的東西`); }
    // 拖曳轉頭
    const yaw0 = await page.evaluate(() => __VR.app.camera.rotation.y);
    const vp = page.viewportSize();
    if (dev.hasTouch) {
      // Playwright 沒有觸控拖曳，用 pointer 事件模擬
      await page.evaluate(([w, h]) => { const c = __VR.app.renderer.domElement; const ev = (t, x) => c.dispatchEvent(new PointerEvent(t, { clientX: x, clientY: h / 2, pointerId: 7, pointerType: 'touch', bubbles: true })); ev('pointerdown', w * 0.7); for (let i = 1; i <= 10; i++) ev('pointermove', w * 0.7 - i * 15); ev('pointerup', w * 0.7 - 150); }, [vp.width, vp.height]);
    } else {
      await page.mouse.move(vp.width * 0.7, vp.height / 2); await page.mouse.down(); await page.mouse.move(vp.width * 0.3, vp.height / 2, { steps: 8 }); await page.mouse.up();
    }
    await page.waitForTimeout(100);
    r.dragLook = (await page.evaluate(() => __VR.app.camera.rotation.y)) !== yaw0;
    if (!r.dragLook) fail(`${label}：拖曳不能轉視角`);
    // 平面模式走完全程（只在電腦跑一次就好）
    if (label === '電腦') {
      await page.reload(); await waitFrames(page, 'frames', 20);
      const steps = await page.evaluate(async () => {
        const log = []; for (let i = 0; i < 200; i++) {
          const n = window.__GAME.nextTarget(); if (!n) break;
          __VR.select(n); log.push(n); await new Promise(r => setTimeout(r, 30));
        } return { log, ended: window.__GAME.ended };
      });
      r.playthrough = steps;
      if (!steps.ended) fail('平面模式照 nextTarget() 點完仍沒走到結局');
    }
    // 遊戲選單：往上看（約 55 度），用真的點擊打開
    await page.evaluate(() => __VR.look(0, 0.95)); await page.waitForTimeout(150);
    const mp = await page.evaluate(() => __VR.screenPos('menu:open'));
    if (!mp) { r.menu = '往上看找不到選單'; fail(`${label}：往上看看不到「☰ 選單」`); }
    else {
      if (dev.hasTouch) await page.touchscreen.tap(mp[0], mp[1]); else await page.mouse.click(mp[0], mp[1]);
      await page.waitForTimeout(200);
      const items = await page.evaluate(() => __VR.names().filter(n => n.startsWith('menu:')));
      r.menu = items;
      if (!items.includes('menu:music') || !items.includes('menu:reload')) fail(`${label}：點了選單但沒出現選項`);
      if (items.includes('menu:exitVR')) fail(`${label}：平面模式不該出現「退出 VR」`);
      await page.screenshot({ path: join(root, `tools/_shot_${folder}_${label}選單.png`) });
      await page.evaluate(() => __VR.select('menu:close'));
    }
    await page.evaluate(() => __VR.look(0, 0));
    const shot = join(root, `tools/_shot_${folder}_${label}.png`);
    await page.screenshot({ path: shot }); r.screenshot = shot;
  } catch (e) { fail(`${label}：${e.message.split('\n')[0]}`); }
  r.errors = errs; if (errs.length) fail(`${label}：有錯誤 ${errs[0]}`);
  await ctx.close();
}

// ---------- 3：模擬 Meta Quest 2 ----------
{
  const r = report.xr;
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript({ content: iwerSrc + `\n;window.__IWER = new IWER.XRDevice(IWER.metaQuest2); window.__IWER.installRuntime({ forceInstall: true });` });
  const page = await ctx.newPage(); const errs = []; watchErrors(page, errs);
  try {
    await page.goto(base, { waitUntil: 'load' });
    await waitFrames(page, 'frames', 10);
    await page.waitForSelector('#enterVR:not([hidden])', { timeout: 8000 });
    r.vrButton = '有出現';
    await page.click('#enterVR');
    await page.waitForFunction(() => window.__VR && __VR.presenting, null, { timeout: 8000 });
    await waitFrames(page, 'xrFrames', 30);
    r.session = 'immersive-vr 已啟動';
    await page.screenshot({ path: join(root, `tools/_shot_${folder}_VR開場.png`) });
    r.xrFramesAfterEnter = await page.evaluate(() => __VR.xrFrames);
    // 用模擬右手把一步步點到結局
    const aimAndTrigger = (name) => page.evaluate(async (name) => {
        const d = window.__IWER, c = d.controllers.right;
        const w = __VR.worldPos(name); if (!w) return 'noPos';
        const head = __VR.app.camera.getWorldPosition(new __VR.app.THREE.Vector3());
        const t = __VR.toRig(...w), h = __VR.toRig(head.x, head.y, head.z);
        // 手把放在頭和目標之間、離目標 0.6 公尺處，朝目標瞄準
        const dx = t[0] - h[0], dy = t[1] - h[1], dz = t[2] - h[2], L = Math.hypot(dx, dy, dz) || 1;
        const k = Math.max(0, (L - 0.6) / L);
        const from = [h[0] + dx * k, h[1] + dy * k, h[2] + dz * k];
        c.position.set(...from); c.quaternion.set(...__VR.lookQuat(from, t));
        const raf = () => new Promise(r => setTimeout(r, 60));
        await raf(); await raf();
        const before = __VR.selectCount;
        c.updateButtonValue('trigger', 1); await raf(); await raf();
        c.updateButtonValue('trigger', 0); await raf();
        return __VR.selectCount > before ? 'hit' : 'miss';
      }, name);
    const log = [];
    for (let i = 0; i < 80; i++) {
      const name = await page.evaluate(() => window.__GAME.nextTarget());
      if (!name) break;
      const ok = await aimAndTrigger(name);
      log.push(`${name}:${ok}`);
      if (ok !== 'hit') { fail(`VR：手把射線點不到「${name}」(${ok})`); break; }
    }
    r.controllerPlaythrough = log;
    r.ended = await page.evaluate(() => window.__GAME.ended);
    if (!r.ended) fail('VR：用模擬手把點完仍沒走到結局');
    // 搖桿轉向
    const rot0 = await page.evaluate(() => __VR.app.rig.rotation.y);
    await page.evaluate(async () => { const c = __IWER.controllers.right; c.updateAxes('thumbstick', 1, 0); await new Promise(r => setTimeout(r, 150)); c.updateAxes('thumbstick', 0, 0); await new Promise(r => setTimeout(r, 100)); });
    r.snapTurn = (await page.evaluate(() => __VR.app.rig.rotation.y)) !== rot0;
    if (!r.snapTurn) fail('VR：搖桿左右推不會轉向');
    await page.screenshot({ path: join(root, `tools/_shot_${folder}_VR.png`) });
    // 遊戲選單：手把點斜上方的「☰ 選單」→ 開關音樂 → 退出 VR
    const m = r.menu = {};
    m.open = await aimAndTrigger('menu:open');
    const items = await page.evaluate(() => __VR.names().filter(n => n.startsWith('menu:')));
    m.items = items;
    if (m.open !== 'hit' || !items.includes('menu:exitVR')) fail('VR：手把點不到斜上方的選單，或選單裡沒有「退出 VR」');
    else {
      await page.screenshot({ path: join(root, `tools/_shot_${folder}_VR選單.png`) });
      m.music = await aimAndTrigger('menu:music');
      m.musicOn = await page.evaluate(() => __VR.app.music.on);
      if (!m.musicOn) fail('VR：選單的音樂開關沒作用');
      await aimAndTrigger('menu:music');
      m.exit = await aimAndTrigger('menu:exitVR');
      await page.waitForTimeout(300);
      m.exitedVR = !(await page.evaluate(() => __VR.presenting));
      if (!m.exitedVR) fail('VR：選單的「退出 VR」沒作用');
    }
  } catch (e) { fail(`VR：${e.message.split('\n')[0]}`); }
  r.errors = errs; if (errs.length) fail(`VR：有錯誤 ${errs[0]}`);
  await ctx.close();
}

await browser.close(); server.close();
console.log(JSON.stringify(report, null, 2));
process.exit(report.ok ? 0 : 1);
