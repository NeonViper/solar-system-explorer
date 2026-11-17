/* Solar System Explorer - build-time asset fetcher.
 * Downloads everything the app needs ONCE into local project files, then the
 * app runs fully offline. Run with:  node tools/fetch-assets.js
 * This file is NOT loaded by the application.
 */
const https = require('https');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const TEX = path.join(ROOT, 'assets', 'textures');
fs.mkdirSync(TEX, { recursive: true });

function get(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 6) return reject(new Error('too many redirects'));
    https.get(url, { headers: { 'User-Agent': 'SolarSystemExplorer-offline-build/1.0' }, timeout: 90000 }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(get(new URL(res.headers.location, url).toString(), redirects + 1));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode)); }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('timeout', function () { this.destroy(new Error('timeout')); }).on('error', reject);
  });
}

const SSR = 'https://www.solarsystemscope.com/textures/download/';
/* name on disk  ->  source url. Bodies without an entry get procedural textures. */
const FILES = [
  ['sun.jpg', SSR + '2k_sun.jpg'],
  ['mercury.jpg', SSR + '2k_mercury.jpg'],
  ['venus_surface.jpg', SSR + '2k_venus_surface.jpg'],
  ['venus_atmosphere.jpg', SSR + '2k_venus_atmosphere.jpg'],
  ['earth_day.jpg', SSR + '2k_earth_daymap.jpg'],
  ['earth_night.jpg', SSR + '2k_earth_nightmap.jpg'],
  ['earth_clouds.jpg', SSR + '2k_earth_clouds.jpg'],
  ['mars.jpg', SSR + '2k_mars.jpg'],
  ['jupiter.jpg', SSR + '2k_jupiter.jpg'],
  ['saturn.jpg', SSR + '2k_saturn.jpg'],
  ['saturn_ring.png', SSR + '2k_saturn_ring_alpha.png'],
  ['uranus.jpg', SSR + '2k_uranus.jpg'],
  ['neptune.jpg', SSR + '2k_neptune.jpg'],
  ['moon.jpg', SSR + '2k_moon.jpg'],
  ['ceres.jpg', SSR + '2k_ceres_fictional.jpg'],
  ['haumea.jpg', SSR + '2k_haumea_fictional.jpg'],
  ['makemake.jpg', SSR + '2k_makemake_fictional.jpg'],
  ['eris.jpg', SSR + '2k_eris_fictional.jpg'],
  ['stars.jpg', SSR + '2k_stars_milky_way.jpg'],
  ['io.jpg', 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/34/Io_-_Corrected.jpg/1280px-Io_-_Corrected.jpg'],
  ['europa.jpg', 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e1/Europa-mosaik-980x490.jpg/1280px-Europa-mosaik-980x490.jpg'],
  ['ganymede.jpg', 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/22/Ganymede_voyager.jpg/1280px-Ganymede_voyager.jpg'],
  ['callisto.jpg', 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d2/Callisto.jpg/1280px-Callisto.jpg'],
  ['titan.jpg', 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e1/Titan_in_true_color.jpg/1280px-Titan_in_true_color.jpg'],
  ['rhea.jpg', 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/19/Rhea_at_different_phase_angles.jpg/1280px-Rhea_at_different_phase_angles.jpg'],
  ['iapetus.jpg', 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/00/Iapetus_-_2007-12-31.jpg/1280px-Iapetus_-_2007-12-31.jpg'],
  ['mimas.jpg', 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/10/Mimas_v2.jpg/1280px-Mimas_v2.jpg'],
  ['enceladus.jpg', 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/45/Enceladus_disk.jpg/1280px-Enceladus_disk.jpg'],
  ['triton.jpg', 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e1/Triton_Apollo13.jpg/1280px-Triton_Apollo13.jpg'],
  ['pluto.jpg', 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e8/Pluto_in_True_Color_-_High-Res.jpg/1280px-Pluto_in_True_Color_-_High-Res.jpg'],
  ['charon.jpg', 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9f/Charon_in_False_Color_from_New_Horizons.png/1280px-Charon_in_False_Color_from_New_Horizons.png']
];

const THREE_SOURCES = [
  'https://cdn.jsdelivr.net/npm/three@0.150.1/build/three.min.js',
  'https://unpkg.com/three@0.150.1/build/three.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js'
];

function magicOk(buf, name) {
  if (/\.png$/i.test(name)) return buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  if (/\.jpe?g$/i.test(name)) return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  return buf.length > 2000;
}

(async () => {
  const report = [];
  let ok = 0, bad = 0;

  for (const [name, url] of FILES) {
    const out = path.join(TEX, name);
    try {
      const buf = await get(url);
      if (!magicOk(buf, name)) throw new Error('not an image (' + buf.length + ' bytes)');
      fs.writeFileSync(out, buf);
      report.push('OK   ' + name.padEnd(22) + (buf.length / 1024).toFixed(0).padStart(6) + ' KB  ' + url);
      ok++;
    } catch (e) {
      report.push('FAIL ' + name.padEnd(22) + String(e.message).slice(0, 70).padEnd(70) + ' ' + url);
      bad++;
    }
  }

  const threeOut = path.join(ROOT, 'three.min.js');
  let threeOk = false;
  for (const url of THREE_SOURCES) {
    try {
      const buf = await get(url);
      const txt = buf.toString('latin1');
      if (buf.length < 200000 || !/THREE/.test(txt)) throw new Error('suspicious library (' + buf.length + ' bytes)');
      fs.writeFileSync(threeOut, buf);
      report.push('OK   three.min.js'.padEnd(27) + (buf.length / 1024).toFixed(0).padStart(6) + ' KB  ' + url);
      threeOk = true; ok++; break;
    } catch (e) { report.push('FAIL three.min.js ' + e.message + '  ' + url); bad++; }
  }

  console.log(report.join('\n'));
  console.log('\nwrote textures: ' + ok + ' ok / ' + bad + ' failed; three.js: ' + (threeOk ? 'yes' : 'NO'));
  console.log('total size: ' + (fs.readdirSync(TEX).reduce((s, f) => s + fs.statSync(path.join(TEX, f)).size, 0) / 1048576).toFixed(1) + ' MB of textures');
})();
