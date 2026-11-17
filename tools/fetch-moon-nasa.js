/* Fallback texture fetch for the moons Wikimedia kept rate-limiting.
 * Sources NASA's open Image Library API (images-api.nasa.gov) — public domain.
 * Writes assets/textures/<id>.jpg and merges results into the manifest.
 */
const https = require('https');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const TEX = path.join(ROOT, 'assets', 'textures');
const MANIFEST = path.join(ROOT, 'tools', 'sources', 'moon-textures-manifest.json');
const UA = 'SolarSystemExplorerOfflineBuild/1.0 (local astronomy visualiser)';

function get(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 6) return reject(new Error('too many redirects'));
    const u = new URL(url);
    const opt = { hostname: u.hostname, path: u.pathname + u.search, headers: { 'User-Agent': UA, 'Accept': '*/*' }, timeout: 90000 };
    https.get(opt, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) { res.resume(); return resolve(get(new URL(res.headers.location, url).toString(), redirects + 1)); }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, type: res.headers['content-type'], body: Buffer.concat(chunks) }));
      res.on('error', reject);
    }).on('timeout', function () { this.destroy(new Error('timeout')); }).on('error', reject);
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

const TARGETS = [
  { id: 'enceladus', q: 'Enceladus global mosaic', match: /enceladus/i },
  { id: 'miranda', q: 'Miranda moon mosaic Voyager', match: /miranda/i },
  { id: 'hyperion', q: 'Hyperion Saturn moon', match: /hyperion/i }
];

(async () => {
  let man = {};
  try { man = JSON.parse(fs.readFileSync(MANIFEST, 'utf8')); } catch (e) {}
  for (const t of TARGETS) {
    const target = path.join(TEX, t.id + '.jpg');
    if (fs.existsSync(target)) { console.log('have  ' + t.id); continue; }
    try {
      const s = await get('https://images-api.nasa.gov/search?media_type=image&q=' + encodeURIComponent(t.q));
      if (s.status !== 200) throw new Error('search HTTP ' + s.status);
      const items = JSON.parse(s.body.toString()).collection.items || [];
      // prefer items whose title/nasa_id mentions mosaic or global
      const cand = items.filter(it => t.match.test(it.data[0].title + ' ' + it.data[0].nasa_id))
                        .sort((a, b) => {
                          const sa = /mosaic|global/i.test(a.data[0].title) ? 1 : 0;
                          const sb = /mosaic|global/i.test(b.data[0].title) ? 1 : 0;
                          return sb - sa;
                        });
      if (!cand.length) throw new Error('no NASA results');
      let picked = null, bytes = null;
      for (const it of cand.slice(0, 6)) {
        await sleep(1500);
        const links = [];
        // some items link straight to the image; others to a JSON asset manifest
        const direct = (it.links || []).filter(l => /nasa\.gov/.test(l.href) && !/\/asset\/json/i.test(l.href));
        const manifest = (it.links || []).filter(l => /\/asset\/json/i.test(l.href) || /\.json/.test(l.href) || (!/\.(jpe?g|png)/i.test(l.href) && l.rel === 'collection'));
        const al = await get((manifest[0] || it.links[0]).href);
        if (al.status === 200 && (al.type || '').indexOf('json') >= 0 && al.body[0] === 0x7b) {
          try { (JSON.parse(al.body.toString()).links || []).forEach(l => links.push(l)); } catch (e) {}
        }
        // build candidate image URLs from manifest + direct links
        const imgUrls = links.filter(l => /image\/(jpeg|png)/.test(l.media_type || '') || /\.(jpe?g|png)/i.test(l.href))
          .sort((a, b) => {
            const order = { original: 3, large: 2, preview: 1 };
            return (order[b.rendering] || 0) - (order[a.rendering] || 0);
          }).map(l => l.href)
          .concat(direct.map(l => l.href));
        for (const href of imgUrls) {
          if (/\.(mp4|m4v|mpd|m3u8)(\?|$)/i.test(href)) continue;
          const g = await get(href);
          if (g.status !== 200) continue;
          const jpg = g.body[0] === 0xff && g.body[1] === 0xd8, png = g.body[0] === 0x89 && g.body[1] === 0x50;
          if (!jpg && !png) continue;
          if (g.body.length < 15000) continue; // skip thumbnails
          picked = { it, href }; bytes = g.body; break;
        }
        if (picked) break;
      }
      if (!picked) throw new Error('no usable image asset');
      fs.writeFileSync(target, bytes);
      man[t.id] = { status: 'ok', saved: t.id + '.jpg', bytes: bytes.length, license: 'Public domain (NASA)', title: picked.it.data[0].title, nasaId: picked.it.data[0].nasa_id, src: picked.href, page: 'https://images.nasa.gov/details/' + picked.it.data[0].nasa_id };
      console.log('OK   ' + t.id.padEnd(10) + picked.it.data[0].nasa_id + '  ' + (bytes.length / 1024 | 0) + ' KB  ' + picked.it.data[0].title.slice(0, 60));
    } catch (e) {
      man[t.id] = { status: 'failed', error: e.message };
      console.log('FAIL ' + t.id.padEnd(10) + e.message);
    }
    fs.writeFileSync(MANIFEST, JSON.stringify(man, null, 1));
    await sleep(2000);
  }
  console.log('done');
})();
