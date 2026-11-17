/* Build-time helper: find + download real surface maps for moons/dwarf planets
 * from Wikimedia Commons (free licenses), with polite spacing to avoid 429s.
 * Writes assets/textures/<name>.jpg and tools/sources/moon-textures-manifest.json
 * Not used by the running app.
 */
const https = require('https');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const TEX = path.join(ROOT, 'assets', 'textures');
const MANIFEST = path.join(ROOT, 'tools', 'sources', 'moon-textures-manifest.json');
const UA = 'SolarSystemExplorerOfflineBuild/1.0 (local astronomy visualiser; single-user build)';

function req(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('redirects'));
    const u = new URL(url);
    const opt = { hostname: u.hostname, path: u.pathname + u.search, headers: { 'User-Agent': UA, 'Accept': '*/*' }, timeout: 60000 };
    https.get(opt, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) { res.resume(); return resolve(req(new URL(res.headers.location, url).toString(), redirects + 1)); }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, type: res.headers['content-type'], body: Buffer.concat(chunks) }));
      res.on('error', reject);
    }).on('timeout', function () { this.destroy(new Error('timeout')); }).on('error', reject);
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const api = q => 'https://commons.wikimedia.org/w/api.php?format=json&action=query&' + q;

const BODIES = [
  ['io', 'Io (moon) global map'], ['europa', 'Europa (moon) map'], ['ganymede', 'Ganymede (moon) map'],
  ['callisto', 'Callisto (moon) map'], ['titan', 'Titan (moon) map'], ['rhea', 'Rhea (moon) map'],
  ['iapetus', 'Iapetus (moon) map'], ['mimas', 'Mimas (moon) map'], ['enceladus', 'Enceladus map'],
  ['dione', 'Dione (moon) map'], ['tethys', 'Tethys (moon) map'], ['triton', 'Triton (moon) map'],
  ['miranda', 'Miranda (moon) map'], ['ariel', 'Ariel (moon) map'], ['umbriel', 'Umbriel map'],
  ['titania', 'Titania (moon) map'], ['oberon', 'Oberon (moon) map'], ['phobos', 'Phobos (moon) map'],
  ['deimos', 'Deimos (moon) map'], ['pluto', 'Pluto surface map'], ['charon', 'Charon (moon) map'],
  ['proteus', 'Proteus (moon)'], ['hyperion', 'Hyperion (moon) map'], ['phoebe', 'Phoebe (moon) map']
];

function score(t) {
  const s = t.toLowerCase();
  let v = 0;
  if (/equirect/.test(s)) v += 60;
  if (/map/.test(s)) v += 35;
  if (/global|full|whole/.test(s)) v += 15;
  if (/mosaic/.test(s)) v += 8;
  if (/animation|gif|svg|ogg|\.webm/.test(s)) v -= 200;
  if (/artistic|illustration|artist/.test(s)) v -= 80;
  if (/discovery|trajector|orbit|diagram|chart|size_comparison|scale|logo/.test(s)) v -= 60;
  return v;
}

(async () => {
  const man = {};
  for (const [out, query] of BODIES) {
    const target = path.join(TEX, out + '.jpg');
    if (fs.existsSync(target)) { man[out] = { status: 'already present' }; continue; }
    try {
      await sleep(12000);
      const s = await req(api('list=search&srlimit=14&srnamespace=6&srsearch=' + encodeURIComponent(query)));
      if (s.status !== 200) throw new Error('search HTTP ' + s.status);
      const found = JSON.parse(s.body.toString()).query.search || [];
      const titles = found.map(f => f.title).filter(t => /\.(jpe?g|png)$/i.test(t)).sort((a, b) => score(b) - score(a)).slice(0, 5);
      if (!titles.length) throw new Error('no candidate files');
      let picked = null;
      for (const t of titles) {
        await sleep(6000);
        const i = await req(api('titles=' + encodeURIComponent(t) + '&prop=imageinfo&iiprop=url%7Csize%7Cmime%7Cextmetadata&iiurlwidth=1600'));
        const pages = JSON.parse(i.body.toString()).query.pages;
        const info = Object.values(pages)[0].imageinfo && Object.values(pages)[0].imageinfo[0];
        if (!info) continue;
        if (info.width < 900 || info.width > 9000) continue;
        const lic = (info.extmetadata && info.extmetadata.LicenseShortName && info.extmetadata.LicenseShortName.value) || 'see page';
        const artist = (info.extmetadata && info.extmetadata.Artist && info.extmetadata.Artist.value.replace(/<[^>]+>/g, '').trim()) || '';
        picked = { title: t, w: info.width, h: info.height, url: info.width <= 1600 ? info.url : info.thumburl, lic, artist, page: info.descriptionurl };
        break;
      }
      if (!picked) throw new Error('candidates rejected by size/type');
      let g = null;
      for (let att = 0; att < 6; att++) {
        g = await req(picked.url);
        if (g.status === 200) break;
        console.log('  retry ' + (att + 1) + ' for ' + out + ' in 45s (HTTP ' + g.status + ')');
        await sleep(45000);
      }
      if (g.status !== 200) throw new Error('image HTTP ' + g.status);
      const isJpg = g.body[0] === 0xff && g.body[1] === 0xd8, isPng = g.body[0] === 0x89 && g.body[1] === 0x50;
      if (!isJpg && !isPng) throw new Error('not an image');
      fs.writeFileSync(target, g.body);
      man[out] = Object.assign({ status: 'ok', bytes: g.body.length, saved: out + '.jpg' }, picked);
      console.log('OK   ' + out.padEnd(10) + picked.w + 'x' + picked.h + ' ' + lic0(man[out]) + '  ' + picked.title);
    } catch (e) {
      man[out] = { status: 'failed', error: e.message };
      console.log('FAIL ' + out.padEnd(10) + e.message);
    }
    fs.writeFileSync(MANIFEST, JSON.stringify(man, null, 1));
  }
  console.log('manifest -> ' + MANIFEST);
  function lic0(m) { return (m.lic || '').slice(0, 26); }
})();
