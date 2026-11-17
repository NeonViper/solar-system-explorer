/* Solar System Explorer — autonomous QA harness
 * Boots the app in headless Chromium across desktop/tablet/phone viewports,
 * runs functional assertions through window.__SSE, captures screenshots,
 * and prints a JSON report. WebGL renders via SwiftShader (software) so no
 * GPU is required.
 *
 * Run from a folder containing node_modules with playwright:
 *   node "C:/.../SolarSystemExplorer/tools/qa/qa.js"
 *   node ".../qa.js" --live            hot-reload QA: visible window, reloads
 *                                       + re-probes on every file change
 * Env: QA_OUT (shot dir), QA_ROOT (app root), QA_PORT override,
 *      QA_LIVE_DEVICE (device to watch, default phone-390).
 */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const LIVE = process.argv.includes('--live');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ROOT   = process.env.QA_ROOT || path.resolve(__dirname, '../..');
const OUT    = process.env.QA_OUT  || path.join(process.env.TEMP || '.', 'qa-shots');
const PORT   = +(process.env.QA_PORT || 8128);
let chromium;
try { chromium = require('playwright').chromium; }
catch (e) {
  chromium = require((process.env.PW_DIR || 'C:/Users/yonay/AppData/Local/Temp/opencode/qa')
    + '/node_modules/playwright').chromium;
}
const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css',
  '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.png':'image/png', '.json':'application/json' };

fs.mkdirSync(OUT, { recursive: true });
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  fs.readFile(path.join(ROOT, p), (e, d) => {
    if (e) { res.writeHead(404); res.end('404'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream',
      'Cache-Control': 'no-store' });
    res.end(d);
  });
}).listen(PORT);

const DEVICES = [
  { name: 'desktop-2560', width: 2560, height: 1440, dsf: 1, touch: false },
  { name: 'desktop-1366', width: 1366, height: 768,  dsf: 1, touch: false },
  { name: 'tablet-768',   width: 768,  height: 1024, dsf: 2, touch: true  },
  { name: 'phone-390',    width: 390,  height: 844,  dsf: 2, touch: true  },
  { name: 'phone-360',    width: 360,  height: 640,  dsf: 2, touch: true  },
];

/* functional probe executed inside the page */
const PROBES = () => {
  const S = window.__SSE, THREE = window.THREE, out = {};
  const vp = document.querySelector('.viewport');
  // 1. projection must match the viewport exactly (no stretched spheres)
  out.aspect = +S.camera.aspect.toFixed(5);
  out.aspectExpected = +(vp.clientWidth / vp.clientHeight).toFixed(5);
  out.aspectOk = Math.abs(S.camera.aspect - vp.clientWidth / vp.clientHeight) < 0.01;
  // 2. pinch math: spread zooms in, pinch zooms out, drag rotates
  const cv = document.querySelector('#sceneHost canvas');
  const pe = (t, id, x, y) => cv.dispatchEvent(new PointerEvent(t, { pointerId: id, clientX: x, clientY: y, button: 0, bubbles: true, cancelable: true }));
  S.cam.radiusWanted = 50; S.cam.radius = 50;
  pe('pointerdown', 1, 200, 300); pe('pointerdown', 2, 300, 300); pe('pointermove', 2, 500, 300);
  out.pinchIn = S.cam.radiusWanted < 30; pe('pointerup', 1, 200, 300); pe('pointerup', 2, 500, 300);
  S.cam.radiusWanted = 50;
  pe('pointerdown', 1, 200, 300); pe('pointerdown', 2, 500, 300); pe('pointermove', 2, 300, 300);
  out.pinchOut = S.cam.radiusWanted > 80; pe('pointerup', 1, 200, 300); pe('pointerup', 2, 300, 300);
  const th0 = S.cam.theta;
  pe('pointerdown', 1, 200, 300); pe('pointermove', 1, 260, 300); pe('pointerup', 1, 260, 300);
  out.rotate = Math.abs(S.cam.theta - th0) > 0.01;
  // 3. follow pinning must have zero lag even at extreme sim rates
  const c = S.cam, dt = 1 / 60; let x = 0, v = 10.4 * 365;
  c.target.set(0, 0, 0); c.targetWanted.set(0, 0, 0); if (c._prevW) c._prevW.set(0, 0, 0);
  for (let i = 0; i < 300; i++) { x += v * dt; c.targetWanted.set(x, 0, 0); c.update(dt, 14); }
  out.followLagAt1yPerSec = +c.targetWanted.distanceTo(c.target).toFixed(9);
  // 4. data integrity: every body has a position and a radius
  let missing = [];
  for (const k in S.bodies) { const b = S.bodies[k];
    // sun has no static rUnits by design — its radius is computed live
    const rOk = b.rUnits > 0 || b.def.id === 'sun';
    if (!b.posWorld || !isFinite(b.posWorld.x) || !rOk) missing.push(k); }
  out.bodiesMissing = missing;
  // 5. UI wiring: clock, speed readout, labels populated
  out.uiClock = (document.getElementById('simDateLong') || {}).textContent || '';
  out.uiTime  = (document.getElementById('simTimeShort') || {}).textContent || '';
  out.uiLabels = document.querySelectorAll('.label').length;
  // 6. with the info card open, the HUD preset strip must stay reachable (no overlap)
  S.selectBody('saturn');
  const ir = document.getElementById('infoPanel').getBoundingClientRect();
  const hr = document.querySelector('.hud-tr').getBoundingClientRect();
  out.hudInfoClear = !(ir.left < hr.right - 2 && hr.left < ir.right - 2 &&
                       ir.top < hr.bottom - 2 && hr.top < ir.bottom - 2);
  // 7. small screens: gear opens the drawer, no horizontal overflow,
  //    transport row stretches edge-to-edge with equal buttons
  if (window.innerWidth <= 900) {
    document.getElementById('btnSettings').click();
    out.drawerOpens = document.getElementById('leftPanel').classList.contains('is-open');
    document.getElementById('btnSettings').click();
    out.noHScroll = document.documentElement.scrollWidth <= window.innerWidth + 1;
    if (window.innerWidth <= 760) {
      const bt = document.getElementById('bottombar').getBoundingClientRect();
      const tr = document.querySelector('.transport').getBoundingClientRect();
      const rr = document.querySelector('.rate').getBoundingClientRect();
      const widths = [].slice.call(document.querySelectorAll('.transport .tbtn'))
                       .map(b => Math.round(b.getBoundingClientRect().width));
      out.transportFullWidth = tr.width >= bt.width - 26 && rr.width >= bt.width - 26;
      out.equalButtons = widths.every(w => Math.abs(w - widths[0]) <= 2);
    }
  }
  // focus the sun for the first screenshot
  S.selectBody('sun');
  return out;
};

/* collect page errors into an array; caller resets between reloads */
function wireErrors(page, errors) {
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
}
async function boot(page) {
  await page.goto('http://localhost:' + PORT + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction('window.__SSE && window.__SSE.bodies && window.__SSE.bodies.sun', null, { timeout: 120000 });
  await page.waitForFunction(
    'var ld=document.getElementById("loading"); ld && (ld.style.display==="none" || parseFloat(ld.style.opacity||"1")<0.05)',
    null, { timeout: 60000 });
}
/* undefined (feature not applicable to this device) counts as pass */
function condOk(checks, key){ return checks[key] === undefined || checks[key] === true; }
function verdict(checks, errors) {
  return checks && checks.aspectOk && checks.pinchIn && checks.pinchOut && checks.rotate &&
         checks.followLagAt1yPerSec < 1e-6 && !checks.bodiesMissing.length && checks.uiClock &&
         checks.hudInfoClear && condOk(checks, 'drawerOpens') && condOk(checks, 'noHScroll') &&
         condOk(checks, 'transportFullWidth') && condOk(checks, 'equalButtons') && !errors.length
    ? 'PASS' : 'FAIL';
}

(async () => {
  /* ---------------- live mode: hot-reload QA with a visible window --------- */
  if (LIVE) {
    const d = DEVICES.find(x => x.name === (process.env.QA_LIVE_DEVICE || 'phone-390')) || DEVICES[0];
    const browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-swiftshader'] });
    const ctx = await browser.newContext({ viewport: { width: d.width, height: d.height },
      deviceScaleFactor: d.dsf, hasTouch: d.touch, isMobile: d.touch });
    const page = await ctx.newPage();
    const errors = [];
    wireErrors(page, errors);
    let dirty = true, lastRun = 0;
    fs.watch(ROOT, { recursive: true }, (ev, file) => {
      if (file && /\.(js|css|html|jpg|jpeg|png|json)$/i.test(file)) { dirty = true; console.log('change:', file); }
    });
    console.log('LIVE QA on ' + d.name + ' at http://localhost:' + PORT + '/ — save a file to reload+reprobe');
    for (;;) {
      if (dirty && Date.now() - lastRun > 900) {
        dirty = false; lastRun = Date.now();
        try {
          await boot(page);
          await page.waitForTimeout(2500);                    // textures + first frames
          const checks = await page.evaluate(PROBES);
          console.log(new Date().toISOString().slice(11, 19), verdict(checks, errors), JSON.stringify(checks), errors.length ? '| ERR ' + errors[0] : '');
        } catch (e) { console.log(new Date().toISOString().slice(11, 19), 'FAIL boot:', String(e.message).slice(0, 200)); }
        errors.length = 0;
      }
      await sleep(400);
    }
  }

  /* ---------------- batch mode: device sweep + screenshots ----------------- */
  const results = [];
  const browser = await chromium.launch({ headless: true,
    args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  for (const d of DEVICES) {
    const r = { device: d.name, viewport: d.width + 'x' + d.height };
    const ctx = await browser.newContext({ viewport: { width: d.width, height: d.height },
      deviceScaleFactor: d.dsf, hasTouch: d.touch, isMobile: d.touch });
    const page = await ctx.newPage();
    const errors = [];
    wireErrors(page, errors);
    const t0 = Date.now();
    try {
      await boot(page);
      r.bootMs = Date.now() - t0;
      await page.waitForTimeout(d.width > 2000 ? 6000 : 4000);      // textures + first frames
      r.checks = await page.evaluate(PROBES);
      await page.waitForTimeout(2500);                               // focus glide onto the Sun
      await page.screenshot({ path: path.join(OUT, d.name + '-1-sun.png') });
      await page.evaluate(() => window.__SSE.selectBody('saturn'));
      await page.waitForTimeout(2500);
      await page.screenshot({ path: path.join(OUT, d.name + '-2-saturn.png') });
      await page.evaluate(() => { const S = window.__SSE; S.state.follow = false;
        S.cam.radiusWanted = S.auUnits() * 42; S.cam.targetWanted.set(0, 0, 0); });
      await page.waitForTimeout(3500);
      await page.screenshot({ path: path.join(OUT, d.name + '-3-full.png') });
      if (d.width <= 900) {          /* prove the settings drawer actually opens */
        await page.evaluate(() => document.getElementById('btnSettings').click());
        await page.waitForTimeout(700);
        await page.screenshot({ path: path.join(OUT, d.name + '-4-drawer.png') });
      }
    } catch (e) { r.fatal = String(e && e.message).slice(0, 300); }
    r.errors = errors.slice(0, 6);
    r.ok = !r.fatal && r.checks && r.checks.aspectOk && r.checks.pinchIn && r.checks.pinchOut &&
           r.checks.rotate && r.checks.followLagAt1yPerSec < 1e-6 && !r.checks.bodiesMissing.length &&
           !!r.checks.uiClock && r.checks.hudInfoClear &&
            condOk(r.checks, 'drawerOpens') && condOk(r.checks, 'noHScroll') &&
            condOk(r.checks, 'transportFullWidth') && condOk(r.checks, 'equalButtons') && !errors.length;
    results.push(r);
    await ctx.close();
    console.log(r.device.padEnd(12) + (r.ok ? 'PASS' : 'FAIL') + '  ' + JSON.stringify(r.checks || r.fatal || r.errors));
  }
  await browser.close();
  server.close();
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(results, null, 2));
  console.log('REPORT ' + path.join(OUT, 'report.json'));
})().catch(e => { console.error('FATAL', e); server.close(); process.exit(1); });
