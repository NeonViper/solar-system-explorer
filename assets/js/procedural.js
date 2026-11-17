/* ============================================================================
 * procedural.js — canvas-generated surface maps for bodies whose photographed
 * global maps were not (or could not be) stored locally. Everything is drawn
 * from a seeded PRNG so the output is identical on every machine and every
 * launch: fully deterministic, fully offline.
 *
 * Used by app.js only as a fallback when assets/textures/<name>.jpg is absent,
 * and always for tiny irregular moons where a photo map would be invisible.
 * ==========================================================================*/
window.SSE_PROC = (function () {
  'use strict';

  /* ---- seeded PRNG (mulberry32) + value noise -------------------------------- */
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hash2(x, y, seed) {
    let h = seed + x * 374761393 + y * 668265263;
    h = (h ^ (h >>> 13)) * 1274126177; h = h ^ (h >>> 16);
    return (h >>> 0) / 4294967295;
  }
  function smooth(t) { return t * t * (3 - 2 * t); }
  function vnoise(x, y, seed) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = smooth(x - xi), yf = smooth(y - yi);
    const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed);
    const c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
    return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
  }
  function fbm(x, y, seed, oct) {
    let v = 0, amp = 0.5, f = 1;
    for (let i = 0; i < (oct || 5); i++) { v += amp * vnoise(x * f, y * f, seed + i * 101); amp *= 0.5; f *= 2; }
    return v;
  }

  function mix(c1, c2, t) {
    return [c1[0] + (c2[0] - c1[0]) * t, c1[1] + (c2[1] - c1[1]) * t, c1[2] + (c2[2] - c1[2]) * t];
  }
  function rgb(c) { return 'rgb(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ')'; }

  /* ---- generic cratered icy/rocky regolith ------------------------------------ */
  // base/dark: [r,g,b]; craters: number; tone: 0..1 albedo variance; seed.
  function cratered(w, h, base, dark, craters, tone, seed, icy) {
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(w, h);
    const R = rng(seed);
    for (let y = 0; y < h; y++) {
      const lat = (y / h) * Math.PI;
      for (let x = 0; x < w; x++) {
        // wrap x so the map tiles seamlessly around the sphere
        const u = (x / w) * 12, v = (y / h) * 6;
        let n = fbm(u + Math.cos(0) * 0, v, seed, 5);
        const fine = fbm(u * 4, v * 4, seed + 77, 4);
        let t = (n - 0.5) * tone + (fine - 0.5) * tone * 0.4 + 0.5;
        t = Math.max(0, Math.min(1, t));
        const c = mix(dark, base, t);
        const i = (y * w + x) * 4;
        img.data[i] = c[0]; img.data[i + 1] = c[1]; img.data[i + 2] = c[2]; img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    // craters: draw with per-crater shading; skip near poles for less distortion pain
    for (let k = 0; k < craters; k++) {
      const cx = R() * w, cy = h * (0.06 + R() * 0.88);
      const r = (2 + Math.pow(R(), 2.6) * w * 0.055);
      const grd = ctx.createRadialGradient(cx, cy, r * 0.15, cx, cy, r);
      const rim = icy ? 'rgba(255,255,255,0.34)' : 'rgba(255,250,240,0.26)';
      const floor = icy ? 'rgba(40,44,50,0.38)' : 'rgba(20,16,12,0.42)';
      grd.addColorStop(0, floor);
      grd.addColorStop(0.72, 'rgba(0,0,0,0.05)');
      grd.addColorStop(0.86, rim);
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    }
    return cv;
  }

  /* ---- specialised generators --------------------------------------------------- */
  const GEN = {
    europa: function (w, h) {
      const cv = cratered(w, h, [226, 214, 192], [150, 132, 112], 26, 0.25, 4242, true);
      const ctx = cv.getContext('2d');
      const R = rng(99);
      ctx.lineCap = 'round';
      for (let k = 0; k < 70; k++) {          // the famous lineae crack belts
        let x = R() * w, y = h * (0.05 + R() * 0.9);
        const ang = (R() - 0.5) * Math.PI, len = w * (0.15 + R() * 0.5);
        const band = R() < 0.45;
        ctx.strokeStyle = band ? 'rgba(120,72,40,0.5)' : 'rgba(150,100,70,0.34)';
        ctx.lineWidth = 1 + R() * 3.4;
        ctx.beginPath(); ctx.moveTo(x, y);
        for (let s = 0; s < 14; s++) {
          x += Math.cos(ang + (R() - 0.5) * 0.5) * len / 14;
          y += Math.sin(ang + (R() - 0.5) * 0.5) * len / 14;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      return cv;
    },
    iapetus: function (w, h) {
      const cv = cratered(w, h, [214, 206, 190], [120, 112, 100], 90, 0.3, 777, true);
      const ctx = cv.getContext('2d');
      const g = ctx.createLinearGradient(0, 0, w, 0);   // leading/trailing hemisphere
      g.addColorStop(0, 'rgba(24,18,12,0.0)'); g.addColorStop(0.18, 'rgba(24,18,12,0.0)');
      g.addColorStop(0.5, 'rgba(24,18,12,0.85)'); g.addColorStop(0.82, 'rgba(24,18,12,0.0)');
      g.addColorStop(1, 'rgba(24,18,12,0.0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      const R = rng(1234);
      ctx.fillStyle = 'rgba(210,200,180,0.5)';         // the equatorial ridge
      for (let x = 0; x < w; x += 1) {
        const y = h / 2 + Math.sin(x * 0.03) * 3;
        ctx.fillRect(x, y - 1.5 - R() * 1.5, 1, 3 + R() * 3);
      }
      return cv;
    },
    titan: function (w, h) {
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      const ctx = cv.getContext('2d');
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#c89a55'); g.addColorStop(0.35, '#dcb06a'); g.addColorStop(0.5, '#e8c17d');
      g.addColorStop(0.66, '#d8a85e'); g.addColorStop(1, '#c08d4a');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      const R = rng(555);
      for (let k = 0; k < 90; k++) {                    // haze bands
        const y = R() * h, hh = 2 + R() * 10;
        ctx.fillStyle = 'rgba(255,220,150,' + (0.03 + R() * 0.07).toFixed(3) + ')';
        ctx.beginPath(); ctx.ellipse(R() * w, y, w * (0.2 + R() * 0.5), hh, 0, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = 'rgba(90,50,20,0.10)';            // dark dune seas near equator
      for (let k = 0; k < 30; k++) {
        ctx.beginPath(); ctx.ellipse(R() * w, h * (0.42 + R() * 0.16), 10 + R() * 90, 3 + R() * 8, R(), 0, Math.PI * 2); ctx.fill();
      }
      return cv;
    },
    phobos: function (w, h) { return cratered(w, h, [138, 122, 108], [60, 52, 46], 70, 0.5, 11, false); },
    deimos: function (w, h) { return cratered(w, h, [152, 138, 118], [70, 62, 52], 40, 0.45, 12, false); },
    mimas: function (w, h) {
      const cv = cratered(w, h, [214, 220, 224], [110, 118, 126], 110, 0.32, 13, true);
      const ctx = cv.getContext('2d');                  // Herschel, the big one
      const cx = w * 0.3, cy = h * 0.42, r = w * 0.055;
      const grd = ctx.createRadialGradient(cx, cy, r * 0.1, cx, cy, r);
      grd.addColorStop(0, 'rgba(60,66,74,0.6)'); grd.addColorStop(0.8, 'rgba(255,255,255,0.35)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
      return cv;
    },
    enceladus: function (w, h) {
      const cv = cratered(w, h, [240, 246, 250], [180, 196, 208], 8, 0.12, 14, true);
      const ctx = cv.getContext('2d');
      ctx.strokeStyle = 'rgba(140,160,180,0.55)';       // tiger stripes, south polar terrain
      ctx.lineWidth = 3;
      const R = rng(31);
      for (let k = 0; k < 6; k++) {
        let y = h * (0.75 + R() * 0.2), x = 0;
        ctx.beginPath(); ctx.moveTo(x, y);
        while (x < w) { x += 20 + R() * 40; y += (R() - 0.5) * 22; ctx.lineTo(x, y); }
        ctx.stroke();
      }
      return cv;
    },
    dione: function (w, h) { return cratered(w, h, [205, 212, 218], [104, 112, 120], 60, 0.4, 15, true); },
    tethys: function (w, h) {
      const cv = cratered(w, h, [218, 226, 230], [118, 126, 134], 60, 0.3, 16, true);
      const ctx = cv.getContext('2d');
      ctx.strokeStyle = 'rgba(150,160,170,0.7)'; ctx.lineWidth = w * 0.012;   // Ithaca Chasma
      ctx.beginPath(); ctx.arc(w * 0.62, h * 0.46, w * 0.22, 0.2, Math.PI * 1.7); ctx.stroke();
      return cv;
    },
    hyperion: function (w, h) { return cratered(w, h, [196, 168, 124], [96, 78, 56], 55, 0.6, 17, false); },
    miranda: function (w, h) {
      const cv = cratered(w, h, [190, 200, 208], [96, 106, 116], 50, 0.5, 18, true);
      const ctx = cv.getContext('2d');
      const R = rng(88);
      for (let k = 0; k < 22; k++) {                    // jigsaw chevron zones
        ctx.fillStyle = 'rgba(255,255,255,' + (0.05 + R() * 0.12).toFixed(3) + ')';
        ctx.beginPath();
        const x = R() * w, y = R() * h;
        ctx.moveTo(x, y);
        for (let s = 0; s < 6; s++) ctx.lineTo(x + (R() - 0.5) * 160, y + (R() - 0.5) * 90);
        ctx.closePath(); ctx.fill();
      }
      return cv;
    },
    ariel: function (w, h) { return cratered(w, h, [204, 212, 218], [98, 108, 118], 45, 0.45, 19, true); },
    umbriel: function (w, h) { return cratered(w, h, [132, 138, 142], [52, 56, 60], 80, 0.3, 20, false); },
    titania: function (w, h) { return cratered(w, h, [172, 166, 158], [78, 72, 66], 70, 0.35, 21, false); },
    oberon: function (w, h) { return cratered(w, h, [160, 148, 134], [70, 62, 54], 75, 0.35, 22, false); },
    proteus: function (w, h) { return cratered(w, h, [150, 144, 136], [64, 60, 56], 60, 0.4, 23, false); },
    triton: function (w, h) {
      const cv = cratered(w, h, [212, 216, 226], [150, 140, 150], 14, 0.25, 24, true);
      const ctx = cv.getContext('2d');
      const R = rng(424);
      ctx.fillStyle = 'rgba(190,120,140,0.18)';         // cantaloupe blotches + pinkish tholins
      for (let k = 0; k < 120; k++) {
        ctx.beginPath(); ctx.ellipse(R() * w, R() * h, 6 + R() * 26, 4 + R() * 14, R() * 3, 0, Math.PI * 2); ctx.fill();
      }
      return cv;
    },
    charon: function (w, h) {
      const cv = cratered(w, h, [188, 184, 178], [96, 94, 92], 60, 0.35, 25, true);
      const ctx = cv.getContext('2d');
      const R = rng(606);
      ctx.fillStyle = 'rgba(255,255,255,0.30)';         // northern "Mordor" dark cap region
      for (let k = 0; k < 18; k++) {                    // Serenity Chasma
        ctx.strokeStyle = 'rgba(120,60,50,0.4)'; ctx.lineWidth = 2 + R() * 5;
        let y = h * (0.08 + R() * 0.25), x = 0;
        ctx.beginPath(); ctx.moveTo(x, y);
        while (x < w) { x += 30 + R() * 60; y += (R() - 0.5) * 20; ctx.lineTo(x, y); }
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(80,30,30,0.55)';
      ctx.beginPath(); ctx.ellipse(w * 0.72, h * 0.06, w * 0.14, h * 0.07, 0, 0, Math.PI * 2); ctx.fill();
      return cv;
    },
    pluto: function (w, h) {
      const cv = cratered(w, h, [214, 198, 176], [120, 100, 84], 30, 0.3, 26, false);
      const ctx = cv.getContext('2d');
      ctx.fillStyle = 'rgba(240,232,214,0.75)';         // Sputnik Planitia
      ctx.beginPath(); ctx.ellipse(w * 0.35, h * 0.52, w * 0.2, h * 0.17, 0.4, 0, Math.PI * 2); ctx.fill();
      const R = rng(1301);
      ctx.fillStyle = 'rgba(110,50,40,0.35)';           // tholin band across the equator
      for (let k = 0; k < 40; k++) {
        ctx.beginPath(); ctx.ellipse(R() * w, h * (0.42 + R() * 0.18), 14 + R() * 70, 5 + R() * 14, R(), 0, Math.PI * 2); ctx.fill();
      }
      return cv;
    }
  };

  function make(id, size) {
    size = size || 1024;
    const g = GEN[id];
    if (g) return g(size, size / 2);
    return cratered(size, size / 2, [170, 166, 160], [80, 78, 74], 50, 0.35,
      id.split('').reduce((a, c) => a * 31 + c.charCodeAt(0), 7) >>> 0, true);
  }

  return { make: make, rng: rng };
})();
