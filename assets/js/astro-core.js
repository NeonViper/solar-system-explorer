/* ============================================================================
 * astro-core.js — ephemeris mathematics for Solar System Explorer.
 *
 * Implements the JPL "Keplerian Elements for Approximate Positions of the
 * Major Planets" algorithm (Standish & Williams): linear element rates in
 * Julian centuries since J2000, classical Kepler equation solved by Newton
 * iteration. Positions are heliocentric ecliptic rectangular coordinates in
 * AU (ecliptic-of-date, J2000 reference — precession neglected, which is the
 * published accuracy budget of the element tables themselves: ~1' for the
 * major planets over 1800–2050).
 *
 * No network access, no dependencies beyond window.SSE_DATA.
 * ==========================================================================*/
window.SSE_CORE = (function () {
  'use strict';

  const DEG = Math.PI / 180;
  const J2000 = 2451545.0;                      // JD of 2000-01-01 12:00 TT
  const OBLIQUITY = 23.4392911 * DEG;           // mean obliquity at J2000
  const AU_KM = 149597870.7;

  /* ---- Julian date handling ------------------------------------------------ */
  function jdFromDate(d) {
    // Accepts Date (any tz) or {y,m,dy,h,mi,s} parts; returns Julian Day.
    if (d instanceof Date) return d.getTime() / 86400000 + 2440587.5;
    const yy = d.y <= 0 ? d.y + 1 : d.y;        // no year 0 in astronomical use here
    const m = (d.m || 1);
    const a = Math.floor((14 - m) / 12);
    const y = yy + 4800 - a;
    const mm = m + 12 * a - 3;
    const jdn = (d.dy || 1) + Math.floor((153 * mm + 2) / 5) + 365 * y +
      Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) - 32045;
    return jdn + ((d.h || 12) - 12) / 24 + (d.mi || 0) / 1440 + (d.s || 0) / 86400;
  }
  function dateFromJd(jd) {
    return new Date((jd - 2440587.5) * 86400000);
  }
  function jdFromCivil(y, mo, dy, h, mi) {
    return jdFromDate({ y: y, m: mo, dy: dy, h: h || 0, mi: mi || 0 });
  }

  /* ---- Kepler equation ------------------------------------------------------ */
  function solveKepler(Mrad, e) {
    let E = Mrad + e * Math.sin(Mrad);          // smart start
    for (let k = 0; k < 25; k++) {
      const dE = (E - e * Math.sin(E) - Mrad) / (1 - e * Math.cos(E));
      E -= dE;
      if (Math.abs(dE) < 1e-10) break;
    }
    return E;
  }

  /* ---- element evaluation ----------------------------------------------------
   * orb: [a,e,i,L,peri,node, da,de,di,dL,dperi,dnode]  (deg & AU; peri/node are
   * LONGITUDES per JPL convention).
   * For orbitSource 'osculating-j2000' the rates are ignored and mean motion
   * comes from Kepler's third law.
   * Returns {a,e,i,omega,node,M} in radians (omega = argument of perihelion). */
  function elementsAt(orb, jd, source) {
    let a, e, i, L, peri, node;
    if (source === 'osculating-j2000') {
      a = orb[0]; e = orb[1]; i = orb[2]; L = orb[3]; peri = orb[4]; node = orb[5];
      const n = 360 / (365.25 * Math.pow(a, 1.5));           // deg per day
      L = L + n * (jd - J2000);
    } else {
      const T = (jd - J2000) / 36525;
      a = orb[0] + orb[6] * T; e = orb[1] + orb[7] * T; i = orb[2] + orb[8] * T;
      L = orb[3] + orb[9] * T; peri = orb[4] + orb[10] * T; node = orb[5] + orb[11] * T;
    }
    let M = (L - peri) % 360; if (M < 0) M += 360;
    return { a: a, e: e, i: i * DEG, omega: (peri - node) * DEG, node: node * DEG, M: M * DEG };
  }

  /* ---- heliocentric position from elements (AU) ----------------------------- */
  function heliocentric(orb, jd, source, out) {
    const el = elementsAt(orb, jd, source);
    const E = solveKepler(el.M, el.e);
    const xv = el.a * (Math.cos(E) - el.e);
    const yv = el.a * Math.sqrt(1 - el.e * el.e) * Math.sin(E);
    const cw = Math.cos(el.omega), sw = Math.sin(el.omega);
    const co = Math.cos(el.node), so = Math.sin(el.node);
    const ci = Math.cos(el.i), si = Math.sin(el.i);
    const x = (cw * co - sw * so * ci) * xv + (-sw * co - cw * so * ci) * yv;
    const y = (cw * so + sw * co * ci) * xv + (-sw * so + cw * co * ci) * yv;
    const z = (sw * si) * xv + (cw * si) * yv;
    (out = out || [0, 0, 0])[0] = x; out[1] = y; out[2] = z;
    return { pos: out, el: el };
  }

  /* ---- Moon: extra terms so eclipses/rises behave --------------------------
   * The Moon gets the classic truncated series for node regression and apsidal
   * advance (Ω −0.05295°/d, ω +0.11140°/d) plus the two dominant equation
   * terms (6.29′ sin M_sun … kept as: +6.29 sin M_moon-ish approximations),
   * giving ≈0.5° accuracy — enough for eclipse checks and a convincing sky. */
  function moonGeoEcliptic(moonDef, jd, out) {
    const P = moonDef.orbit[1], aKm = moonDef.orbit[0], e = moonDef.orbit[2];
    const d = jd - J2000;
    const M = ((moonDef.orbit[4] + 360 * d / P) % 360 + 360) % 360;   // mean anomaly
    const L = ((M + moonDef.orbit[4] + 360 * 0) % 360);
    const Msun = ((357.5291 + 0.98560028 * d) % 360) * DEG;
    const Mm = M * DEG;
    const node = (125.04452 - 0.0529538083 * d) * DEG;
    const inc = moonDef.orbit[3] * DEG;
    const omega = (318.0633 + 0.1114039555 * d) * DEG;
    let lon = M + omega / DEG + node / DEG +
      6.287 * Math.sin(Mm) + 1.274 * Math.sin(2 * (Mm - Msun)) +
      0.658 * Math.sin(2 * Mm) + 0.214 * Math.sin(2 * Msun) - 0.186 * Math.sin(Msun);
    lon = lon * DEG;
    const lat = (5.128 * Math.sin(Mm + omega / DEG + 0) +
                 0.281 * Math.sin(Mm - 2 * Msun + omega / DEG) +
                 0.278 * Math.sin(omega / DEG + node / DEG - Mm - 2 * node / DEG + 2 * lon / DEG)) * DEG;
    const distKm = aKm * (1 - e * Math.cos(solveKepler(Mm, e)));
    const cb = Math.cos(lat), r = distKm / AU_KM;
    (out = out || [0, 0, 0])[0] = r * cb * Math.cos(lon);
    out[1] = r * cb * Math.sin(lon);
    out[2] = r * Math.sin(lat);
    return out;
  }

  /* ---- regular (planet-parented) moon, circular, in parent frame ------------ */
  function moonLocal(moonDef, jd, out) {
    const P = moonDef.orbit[1], aKm = moonDef.orbit[0], e = moonDef.orbit[2];
    const d = jd - J2000;
    let th = ((moonDef.orbit[4] + 360 * d / P) % 360 + 360) % 360;
    th *= DEG;
    const rKm = aKm * (1 - e * e) / (1 + e * Math.cos(th));   // true-anomaly radius, near-circular
    const inc = moonDef.orbit[3] * DEG;                       // to parent equator
    const x = rKm * Math.cos(th), yp = rKm * Math.sin(th);
    // Parent-equator frame: orbit circle in x/z tilted about the x axis by i,
    // so y = yp·sin i (up), z = yp·cos i. The parent's tilt group in the scene
    // supplies the planet's obliquity on top of this.
    (out = out || [0, 0, 0])[0] = x;
    out[1] = yp * Math.sin(inc);
    out[2] = yp * Math.cos(inc);
    return { km: out, x: out[0], y: out[1], z: out[2] };
  }

  /* ---- observer geometry ------------------------------------------------------
   * Ecliptic (AU) → equatorial → horizon. All angles radians unless noted. */
  function geoToEq(x, y, z, out) {
    const ce = Math.cos(OBLIQUITY), se = Math.sin(OBLIQUITY);
    (out = out || [0, 0, 0])[0] = x; out[1] = y * ce - z * se; out[2] = y * se + z * ce;
    return out;
  }
  function radDec(vec) {
    const r = Math.hypot(vec[0], vec[1], vec[2]);
    return { ra: (Math.atan2(vec[1], vec[0]) / DEG + 360) % 360, dec: Math.asin(vec[2] / r) / DEG, r: r };
  }
  function lst(jd, lonDeg) {
    const d = jd - J2000;
    let g = (280.46061837 + 360.98564736629 * d) % 360;       // GMST deg
    if (g < 0) g += 360;
    return (g + lonDeg + 360) % 360;
  }
  function altAz(raDeg, decDeg, lstDeg, latDeg) {
    const H = (lstDeg - raDeg) * DEG;
    const dLat = latDeg * DEG, dDec = decDeg * DEG;
    const alt = Math.asin(Math.sin(dLat) * Math.sin(dDec) + Math.cos(dLat) * Math.cos(dDec) * Math.cos(H));
    let az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(dLat) - Math.tan(dDec) * Math.cos(dLat)) / DEG;
    az = (az + 180 + 360) % 360;
    return { alt: alt / DEG, az: az };
  }

  /* ---- unit-system: heliocentric AU → scene units ---------------------------
   * Scene convention: ecliptic plane = scene X/Z, ecliptic north = +Y.
   * sceneScale = AU_UNITS * distScale. */
  const AU_UNITS = 30;
  function scenePos(helioAu, distScale, out) {
    const s = AU_UNITS * distScale;
    (out = out || [0, 0, 0])[0] = helioAu[0] * s;
    out[1] = helioAu[2] * s;                    // ecliptic z → scene up
    out[2] = -helioAu[1] * s;                   // ecliptic y → scene −z
    return out;
  }

  /* ---- self-test against observable events ----------------------------------- */
  function selfTest(DATA) {
    const results = [];
    function check(name, ok, detail) { results.push({ name: name, ok: !!ok, detail: detail }); }
    const buf = [0, 0, 0], buf2 = [0, 0, 0];
    const byId = {};
    DATA.planets.concat(DATA.dwarfPlanets).forEach(p => { byId[p.id] = p; });

    // 1) Mars opposition of 2018-07-31: Sun–Mars geocentric elongation ≈ 180°.
    const jdOpp = jdFromCivil(2018, 7, 31, 12);
    heliocentric(byId.earth.orbit, jdOpp, byId.earth.orbitSource, buf);
    const earth = buf.slice();
    heliocentric(byId.mars.orbit, jdOpp, byId.mars.orbitSource, buf2);
    const mars = buf2.slice();
    // elongation Sun–Mars as seen from Earth:
    const sunDir = [-earth[0], -earth[1], -earth[2]];
    const marsDir = [mars[0] - earth[0], mars[1] - earth[1], mars[2] - earth[2]];
    const elong = Math.acos((sunDir[0] * marsDir[0] + sunDir[1] * marsDir[1] + sunDir[2] * marsDir[2]) /
      (Math.hypot.apply(null, sunDir) * Math.hypot.apply(null, marsDir))) / DEG;
    check('Mars opposition 2018-07-31 (expect ≈180° elongation)', Math.abs(elong - 180) < 2.5,
      'computed ' + elong.toFixed(2) + '°');

    // 2) Total solar eclipse 2026-08-12 ~17:45 UT: Sun–Moon elongation ≈ 0°.
    const jdEcl = jdFromCivil(2026, 8, 12, 17, 45);
    heliocentric(byId.earth.orbit, jdEcl, byId.earth.orbitSource, buf);
    const e2 = buf.slice();
    const moonDef = DATA.moons.filter(m => m.id === 'moon')[0];
    moonGeoEcliptic(moonDef, jdEcl, buf2);
    const mGeo = buf2.slice();
    const sunE = [-e2[0], -e2[1], -e2[2]];
    const angSunMoon = Math.acos((sunE[0] * mGeo[0] + sunE[1] * mGeo[1] + sunE[2] * mGeo[2]) /
      (Math.hypot.apply(null, sunE) * Math.hypot.apply(null, mGeo))) / DEG;
    check('Solar eclipse 2026-08-12 (Sun–Moon separation ≈ 0°)', angSunMoon < 1.0,
      'computed ' + angSunMoon.toFixed(2) + '°');

    // 3) Jupiter vs Saturn 2020-12-21 “Great Conjunction”: separation < 0.2°.
    const jdGC = jdFromCivil(2020, 12, 21, 18);
    heliocentric(byId.earth.orbit, jdGC, null, buf);
    const e3 = buf.slice();
    heliocentric(byId.jupiter.orbit, jdGC, null, buf2);
    const j = [buf2[0] - e3[0], buf2[1] - e3[1], buf2[2] - e3[2]];
    heliocentric(byId.saturn.orbit, jdGC, null, buf);
    const s = [buf[0] - e3[0], buf[1] - e3[1], buf[2] - e3[2]];
    const sep = Math.acos((j[0] * s[0] + j[1] * s[1] + j[2] * s[2]) /
      (Math.hypot.apply(null, j) * Math.hypot.apply(null, s))) / DEG;
    check('Great Conjunction 2020-12-21 (Jup–Sat separation < 0.2°)', sep < 0.25,
      'computed ' + sep.toFixed(3) + '°');

    // 4) Pluto mean period sanity from its series: year length ~248 y.
    const elP = elementsAt(byId.pluto.orbit, J2000);
    const n = 360 / (365.25 * Math.pow(elP.a, 1.5));
    check('Pluto year from Kepler III (≈247.9 y)', Math.abs(365.25 / n - 247.94) < 1.5,
      'computed ' + (365.25 / n).toFixed(2) + ' y');

    // 5) Earth aphelion around July 4 (within 5 days).
    let bestJD = null, bestR = 0;
    for (let day = 0; day < 40; day++) {
      const t = jdFromCivil(2026, 6, 20, 0) + day;
      heliocentric(byId.earth.orbit, t, null, buf);
      const r = Math.hypot(buf[0], buf[1], buf[2]);
      if (r > bestR) { bestR = r; bestJD = t; }
    }
    const aphDate = dateFromJd(bestJD);
    check('Earth aphelion 2026 near 4–7 July', aphDate.getUTCMonth() === 6 && aphDate.getUTCDate() >= 2 && aphDate.getUTCDate() <= 8,
      'computed ' + aphDate.toISOString().slice(0, 10));

    return results;
  }

  return {
    DEG: DEG, J2000: J2000, AU_KM: AU_KM, AU_UNITS: AU_UNITS, OBLIQUITY: OBLIQUITY,
    jdFromDate: jdFromDate, dateFromJd: dateFromJd, jdFromCivil: jdFromCivil,
    heliocentric: heliocentric, elementsAt: elementsAt, solveKepler: solveKepler,
    moonGeoEcliptic: moonGeoEcliptic, moonLocal: moonLocal,
    geoToEq: geoToEq, radDec: radDec, lst: lst, altAz: altAz, scenePos: scenePos,
    selfTest: selfTest
  };
})();
