/* ============================================================================
 * astro-data.js — the offline astronomy dataset for Solar System Explorer.
 *
 * Orbital elements for the eight planets + Pluto are the published Keplerian
 * "approximate positions" elements from JPL Solar System Dynamics
 * (E. M. Standish & J. G. Williams, "Keplerian Elements for Approximate
 * Positions of the Major Planets", appendices for 1800–2050 and 3000 BC–3000 AD;
 * copies of the source pages live in tools/sources/).
 * Elements are mean longitude L, longitude of perihelion, longitude of node,
 * all in degrees, with rates per Julian century (T = centuries since J2000).
 *
 * Physical data (radii, masses, rotation, albedo, …) from NASA planetary
 * fact sheets (nssdc.gsfc.nasa.gov/planetary/factsheet — saved locally in
 * tools/sources/) and NASA/JPL satellite pages.
 *
 * This file is DATA ONLY. It references nothing at runtime except globals,
 * and nothing on the network. Textures referenced below live in
 * assets/textures/; bodies without a texture are drawn procedurally
 * (see procedural.js).
 * ==========================================================================*/
window.SSE_DATA = (function () {
  'use strict';

  // ---- Planets -------------------------------------------------------------
  // orbit: [a AU, e, i°, L° (mean longitude), longPeri°, longNode°, and the
  // six per-century rates in the same order] valid 1800–2050 (Pluto: 3000BC-3000AD table).
  const planets = [
    {
      id: 'mercury', name: 'Mercury', kind: 'planet', color: '#b8aa9b', tex: 'mercury.jpg',
      orbit: [0.38709927, 0.20563593, 7.00497902, 252.25032350, 77.45779628, 48.33076593,
              0.00000037, 0.00001906, -0.00594549, 149472.67411175, 0.16047689, -0.12534081],
      radiusKm: 2439.7, massKg: 3.3011e23, massEarths: 0.0553, density: 5.427,
      gravity: 3.70, escapeVel: 4.25, rotPeriodH: 1407.6, rotNote: '59.06 d (3:2 spin–orbit resonance)',
      tiltDeg: 0.034, albedo: 0.142, tempC: '−173 … 427 (mean 15)',
      orbitalPeriodD: 87.969, periodY: 0.2408, periAU: 0.3075, apoAU: 0.4667, velKms: 47.36, moonsCount: 0,
      discovered: 'Antiquity (visible to the naked eye)', discoveredBy: null,
      atmosphere: 'Exosphere: O, Na, H, He, K (surface pressure ≈ 0)',
      blurb: 'Mercury is the smallest planet and the closest to the Sun. It is a cratered, airless world of iron and rock with a huge solid core that fills about 85% of its radius. Surface temperature swings of 600 °C between day and night are the largest of any planet.',
      world: 'Mariner 10 (1974–75) flew by three times; MESSENGER orbited 2011–2015 and discovered water-ice in permanently shadowed polar craters. BepiColombo (ESA/JAXA) is cruise-flying to Mercury for a 2026 orbit insertion.',
      dayInfo: 'One solar day on Mercury (sunrise to sunrise) lasts 176 Earth days — twice its year.',
      moonNote: null
    },
    {
      id: 'venus', name: 'Venus', kind: 'planet', color: '#e6c87a', tex: 'venus_surface.jpg', texCloud: 'venus_atmosphere.jpg',
      orbit: [0.72333566, 0.00677672, 3.39467605, 181.97909950, 131.60246718, 76.67984255,
              0.00000390, -0.00004107, -0.00078890, 58517.81538729, 0.00268329, -0.27769418],
      radiusKm: 6051.8, massKg: 4.8675e24, massEarths: 0.815, density: 5.243,
      gravity: 8.87, escapeVel: 10.36, rotPeriodH: -5832.5, rotNote: '243.02 d, retrograde',
      tiltDeg: 177.36, albedo: 0.757, tempC: '464 (uniform, runaway greenhouse)',
      orbitalPeriodD: 224.701, periodY: 0.6152, periAU: 0.7184, apoAU: 0.7282, velKms: 35.02, moonsCount: 0,
      discovered: 'Antiquity (brightest planet)', discoveredBy: null,
      atmosphere: '96.5% CO₂, 3.5% N₂; surface pressure 92 bar; H₂SO₄ cloud decks',
      blurb: 'Venus is Earth’s twin gone wrong: nearly the same size and composition, but a runaway greenhouse oven hot enough to melt lead, with crushing 92-bar CO₂ air and global sulfuric-acid clouds that reflect 76% of sunlight. It spins backwards, slower than it orbits.',
      world: 'Venera 7 (1970) was the first soft landing on another planet; Venera 13 (1982) returned colour surface photos. Magellan (1990–94) radar-mapped 98% of the surface through the clouds. VERITAS, DAVINCI and EnVision are scheduled for the late 2020s/early 2030s.',
      dayInfo: 'A Venusian day (243 Earth days) is longer than its year (225 days) — and the Sun rises in the west.',
      moonNote: null
    },
    {
      id: 'earth', name: 'Earth', kind: 'planet', color: '#6b93d6', tex: 'earth_day.jpg', texNight: 'earth_night.jpg', texCloud: 'earth_clouds.jpg',
      orbit: [1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0.0,
              0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0.0],
      radiusKm: 6371.0, massKg: 5.97237e24, massEarths: 1.0, density: 5.514,
      gravity: 9.807, escapeVel: 11.19, rotPeriodH: 23.9345, rotNote: '0.99726 d (sidereal)',
      tiltDeg: 23.44, albedo: 0.306, tempC: '−89 … 57 (mean 15)',
      orbitalPeriodD: 365.256, periodY: 1.0000, periAU: 0.9833, apoAU: 1.0167, velKms: 29.78, moonsCount: 1,
      discovered: '—', discoveredBy: null,
      atmosphere: '78% N₂, 21% O₂, 0.9% Ar, ~0.04% CO₂; troposphere 8–17 km thick',
      blurb: 'Earth is the only known world with liquid surface water, plate tectonics, a global magnetic field strong enough to shield a biosphere, and an oxygen-rich atmosphere produced by life itself. 71% of the surface is ocean.',
      world: 'Earth is, of course, the launch pad for every mission elsewhere. From orbit the most striking discovery is the “overview effect”: the thinness and fragility of the atmosphere. The James Webb and future habitable-world observatories study other planets precisely by comparing them with this one.',
      dayInfo: 'Solar days average 24 h; sidereal rotation is 23 h 56 m 4 s.',
      moonNote: null
    },
    {
      id: 'mars', name: 'Mars', kind: 'planet', color: '#c1653f', tex: 'mars.jpg',
      orbit: [1.52371034, 0.09339410, 1.84969142, -4.55343205, -23.94362959, 49.55953891,
              0.00001847, 0.00007882, -0.00813844, 19140.30268499, 0.44441088, -0.29257343],
      radiusKm: 3389.5, massKg: 6.4171e23, massEarths: 0.107, density: 3.934,
      gravity: 3.72, escapeVel: 5.03, rotPeriodH: 24.6229, rotNote: '1.026 d',
      tiltDeg: 25.19, albedo: 0.248, tempC: '−140 … 20 (mean −63)',
      orbitalPeriodD: 686.980, periodY: 1.8808, periAU: 1.3814, apoAU: 1.6660, velKms: 24.07, moonsCount: 2,
      discovered: 'Antiquity (the “wandering star”)', discoveredBy: null,
      atmosphere: '95% CO₂, 2.8% N₂; pressure 6 mbar — less than 1% of Earth’s',
      blurb: 'Mars is the cold desert half-world: a rust-red iron-oxide surface carrying the tallest volcano (Olympus Mons, 22 km) and the deepest canyon (Valles Marineris, 7 km) in the Solar System. River deltas, lake-bed minerals and subsurface ice show it once ran with liquid water.',
      world: 'The most-visited planet after Earth: Viking 1–2 (1976 landers), Pathfinder/Sojourner, Mars Global Surveyor, Opportunity & Spirit, MRO, Phoenix, Curiosity (2012), InSight (2018), Perseverance + Ingenuity (2021). Sample return is in planning; crewed missions are studied by NASA and SpaceX.',
      dayInfo: 'A sol is 24 h 39 m 35 s — 37 Earth-minutes longer than a day.',
      moonNote: null
    },
    {
      id: 'jupiter', name: 'Jupiter', kind: 'planet', color: '#d8b08c', tex: 'jupiter.jpg',
      orbit: [5.20288700, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.49136258,
              -0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469666],
      radiusKm: 69911, massKg: 1.8982e27, massEarths: 317.8, density: 1.326,
      gravity: 24.79, escapeVel: 59.5, rotPeriodH: 9.9250, rotNote: '9 h 55.7 m (system III, fastest spinner)',
      tiltDeg: 3.13, albedo: 0.52, tempC: '−108 at 1-bar level',
      orbitalPeriodD: 4332.589, periodY: 11.862, periAU: 4.9508, apoAU: 5.4549, velKms: 13.07, moonsCount: 95,
      discovered: 'Antiquity', discoveredBy: null,
      atmosphere: '90% H₂, 10% He (with NH₃, CH₄ clouds); no solid surface — pressure rises smoothly to metallic hydrogen',
      blurb: 'Jupiter is a failed star scaled up into a planetary architect: 318 Earth-masses of hydrogen and helium whose gravity shepherded the whole Solar System’s formation. Its banded jet streams (up to 620 km/h), 400-year-old Great Red Spot storm, and 1.3-million-km-wide magnetosphere make it a giant-laboratory of fluid dynamics.',
      world: 'Pioneer 10/11, Voyager 1/2, Ulysses and New Horizons flew by. Galileo orbited 1995–2003 and dropped an atmospheric probe. Juno has been circling since 2016, mapping the core, aurorae and water-ice lightning. The ESA JUICE mission arrived in 2031-era plans to study the ocean moons.',
      dayInfo: 'Jupiter rotates in under 10 hours — so fast it visibly bulges at the equator.',
      moonNote: null
    },
    {
      id: 'saturn', name: 'Saturn', kind: 'planet', color: '#e3d3a3', tex: 'saturn.jpg', ring: 'saturn_ring.png',
      orbit: [9.53667594, 0.05386179, 2.48599187, 49.95424405, 92.59887831, 113.66242448,
              -0.00125060, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794],
      radiusKm: 58232, massKg: 5.6834e26, massEarths: 95.16, density: 0.687,
      gravity: 10.44, escapeVel: 35.5, rotPeriodH: 10.656, rotNote: '10 h 39 m (radio period)',
      tiltDeg: 26.73, albedo: 0.441, tempC: '−139 at 1-bar level',
      orbitalPeriodD: 10759.22, periodY: 29.457, periAU: 9.0121, apoAU: 10.0612, velKms: 9.68, moonsCount: 274,
      discovered: 'Antiquity', discoveredBy: null,
      atmosphere: '96% H₂, 3% He; six-sided polar jet (hexagon) at 78°N',
      blurb: 'Saturn is the jewel: less dense than water, wrapped in the ring system — billions of ice particles from dust grains to house-sized blocks, only ~10 m thick yet 280,000 km wide. The rings are dynamically young (perhaps 100 Myr) and raining into the planet.',
      world: 'Pioneer 11, Voyager 1/2 flew by; Cassini–Huygens orbited 2004–2017, landing Huygens on Titan in 2005 and discovering Enceladus’ hydrothermal plumes. The final “Grand Finale” orbits (2017) crashed the spacecraft into Saturn to preserve the moons.',
      dayInfo: 'Saturn’s day length was settled by radio emissions at 10 h 39 m 22 s — its magnetic field being oddly axisymmetric.',
      moonNote: null
    },
    {
      id: 'uranus', name: 'Uranus', kind: 'planet', color: '#9fd8e0', tex: 'uranus.jpg',
      orbit: [19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.95427630, 74.01692503,
              -0.00196176, -0.00004397, -0.00242939, 428.48202785, 0.40805281, 0.04240589],
      radiusKm: 25362, massKg: 8.681e25, massEarths: 14.54, density: 1.270,
      gravity: 8.87, escapeVel: 21.3, rotPeriodH: -17.24, rotNote: '17 h 14 m, retrograde (axis tipped 98°)',
      tiltDeg: 97.77, albedo: 0.30, tempC: '−197 (coldest measured atmosphere)',
      orbitalPeriodD: 30688.5, periodY: 84.02, periAU: 18.286, apoAU: 20.096, velKms: 6.80, moonsCount: 28,
      discovered: '13 March 1781', discoveredBy: 'William Herschel (first planet found by telescope)',
      atmosphere: '83% H₂, 15% He, 2% CH₄ (methane gives the cyan colour); coldest atmos. temp in the system: −224 °C',
      blurb: 'Uranus is the tipped-over ice giant — knocked onto its side early in its history, it rolls around the Sun with poles facing the star for 42-year days and nights. Beneath the bland cyan cloud deck lies an ocean mantle of water, methane and ammonia “ices” under colossal pressure.',
      world: 'Visited once: Voyager 2 (24 Jan 1986) discovered 10 moons and the skewed, lumpy magnetic field. No mission has returned; a Uranus orbiter+probe is the flagship priority of the 2023–2032 planetary-science decadal survey.',
      dayInfo: 'Its 98° tilt means each pole gets ~21 years of continuous sunlight, then 21 years of darkness.',
      moonNote: null
    },
    {
      id: 'neptune', name: 'Neptune', kind: 'planet', color: '#4f6fd0', tex: 'neptune.jpg',
      orbit: [30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574,
              0.00026291, 0.00005105, 0.00035372, 218.45105562, -0.32241265, -0.00508664],
      radiusKm: 24622, massKg: 1.02413e26, massEarths: 17.15, density: 1.638,
      gravity: 11.15, escapeVel: 23.5, rotPeriodH: 16.11, rotNote: '16 h 6 m',
      tiltDeg: 28.32, albedo: 0.29, tempC: '−201 (but +46 internally driven)',
      orbitalPeriodD: 60195, periodY: 164.79, periAU: 29.800, apoAU: 30.339, velKms: 5.43, moonsCount: 16,
      discovered: '23 September 1846', discoveredBy: 'J. G. Galle, from U. Le Verrier’s mathematics (and J. C. Adams independently)',
      atmosphere: '80% H₂, 19% He, CH₄; supersonic winds to 2,100 km/h — the fastest in the Solar System',
      blurb: 'Neptune is the stormy outermost planet, found with mathematics before it was ever seen. It radiates 2.6× more heat than it receives, driving 2,100 km/h winds, and its 1-bar temperature is the coldest weather of any planet despite the internal fire beneath.',
      world: 'Only Voyager 2 (25 Aug 1989) has visited, discovering the Great Dark Spot (which later vanished), active geysers on Triton, and six new moons. A Neptune system probe is a top-ranked future-flagell candidate.',
      dayInfo: 'A Neptunian year has completed only once since discovery (in 2011).',
      moonNote: null
    }
  ];

  // ---- Sun -------------------------------------------------------------------
  const sun = {
    id: 'sun', name: 'Sun', kind: 'star', color: '#ffcb6b', tex: 'sun.jpg',
    radiusKm: 695700, massKg: 1.98892e30, massEarths: 332946, density: 1.408,
    gravity: 274, escapeVel: 617.7, rotPeriodH: 609.12, rotNote: '25.4 d at equator (differentially rotating)',
    tiltDeg: 7.25, albedo: null, tempC: '5,500 surface; 15 million °C core',
    discovered: '—', discoveredBy: null,
    atmosphere: 'Photosphere → chromosphere → 2-million-K corona; solar wind ~400 km/s',
    blurb: 'The Sun is a G2V dwarf star holding 99.86% of the Solar System’s mass. Every second it fuses 600 million tonnes of hydrogen into helium, converting 4 million tonnes to light. Its magnetic dynamo drives sunspots (11-yr cycle), flares, and the aurorae that paint Earth’s poles.',
    world: 'SOHO, STEREO, Hinode, SDO and Parker Solar Probe (flying through the corona, 6.9M km at perihelion — the fastest object ever built) monitor it continuously. Solar physics is where we learned neutrinos oscillate.',
    dayInfo: 'Sunlight reaching your eyes left the core ~100,000 years ago after a random walk, then crossed 1 AU in 8 min 20 s.',
    moonNote: null
  };

  // ---- Dwarf planets ---------------------------------------------------------
  // Pluto uses JPL’s published 3000 BC–3000 AD Keplerian series (same solver as
  // the planets). The other three use osculating J2000 elements with mean motion
  // from Kepler’s third law — accurate to a few degrees of longitude across
  // 1800–2050, which the UI labels as “approximate”.
  const dwarfPlanets = [
    {
      id: 'pluto', name: 'Pluto', kind: 'dwarf', color: '#d8c3a5', tex: 'pluto.jpg',
      orbit: [39.48211675, 0.24882730, 17.14001206, 238.92903833, 224.06891629, 110.30393684,
              -0.00031596, 0.00005170, 0.00004818, 145.20780515, -0.04062942, -0.01183482],
      orbitSource: 'jpl-series',
      radiusKm: 1188.3, massKg: 1.303e22, massEarths: 0.00218, density: 1.854,
      gravity: 0.62, escapeVel: 1.21, rotPeriodH: -153.293, rotNote: '6.387 d, retrograde (tidally locked with Charon)',
      tiltDeg: 122.53, albedo: 0.52, tempC: '−229 (26 K)',
      orbitalPeriodD: 90560, periodY: 247.94, periAU: 29.658, apoAU: 49.305, velKms: 4.74, moonsCount: 5,
      discovered: '18 February 1930', discoveredBy: 'Clyde Tombaugh, Lowell Observatory',
      atmosphere: 'Thin N₂ with CH₄ and CO ices sublimating; collapses as Pluto recedes from the Sun',
      blurb: 'Pluto is a 2,377 km-wide dwarf planet of nitrogen ice, water-rock and a subsurface ocean, locked in a 3:2 resonance with Neptune. New Horizons (2015) revealed Sputnik Planitia — a 1,000 km heart-shaped glacier of convecting nitrogen ice with water-ice "icebergs" — and mountains of water-ice 3 km tall still geologically active.',
      world: 'Discovered on a blink comparator; considered the ninth planet until the IAU’s 2006 definition. New Horizons’ single flyby on 14 July 2015 rewrote the textbooks; no return mission exists yet.',
      dayInfo: 'Pluto and Charon are mutually tidally locked: one face always faces Charon, and both keep the same hemisphere toward each other.',
      moonNote: 'Charon is half Pluto’s diameter — the largest moon per relative size in the Solar System, effectively a binary world.'
    },
    {
      id: 'ceres', name: 'Ceres', kind: 'dwarf', color: '#a8a294', tex: 'ceres.jpg',
      orbit: [2.7691, 0.07600, 10.594, 95.99, 169.90, 80.305, 0, 0, 0, 0, 0, 0],
      orbitSource: 'osculating-j2000',
      radiusKm: 469.7, massKg: 9.39e20, massEarths: 0.000157, density: 2.162,
      gravity: 0.28, escapeVel: 0.51, rotPeriodH: 9.074, rotNote: '9.07 h',
      tiltDeg: 4.0, albedo: 0.38, tempC: '−105',
      orbitalPeriodD: 1681.6, periodY: 4.60, periAU: 2.558, apoAU: 2.981, velKms: 17.90, moonsCount: 0,
      discovered: '1 January 1801', discoveredBy: 'Giuseppe Piazzi (first asteroid ever found; reclassified dwarf planet 2006)',
      atmosphere: 'Transient water-vapour plumes detected; otherwise negligible',
      blurb: 'Ceres is the largest object in the asteroid belt — a round, cratered protoplanet that never became a planet, holding about a third of the belt’s entire mass. Bright salt deposits in Occator crater show briny water reached the surface within the last few million years.',
      world: 'Dawn orbited Ceres 2015–2018 after Vesta, finding a salty subsurface ocean remnant, cryovolcanic Ahuna Mons, and localized bright carbonate deposits (faculae).',
      dayInfo: 'A Ceres year is 4.6 Earth years; its day just 9 hours.',
      moonNote: null
    },
    {
      id: 'eris', name: 'Eris', kind: 'dwarf', color: '#dfe3e6', tex: 'eris.jpg',
      orbit: [67.864, 0.43607, 43.905, 204.4, 35.78 + 151.65, 35.78, 0, 0, 0, 0, 0, 0],
      orbitSource: 'osculating-j2000',
      radiusKm: 1163, massKg: 1.6466e22, massEarths: 0.00276, density: 2.43,
      gravity: 0.82, escapeVel: 1.38, rotPeriodH: null, rotNote: '15.8 d (estimated)',
      tiltDeg: 78, albedo: 0.96, tempC: '−231 (42 K)',
      orbitalPeriodD: 208748, periodY: 572.8, periAU: 38.16, apoAU: 97.57, velKms: 2.77, moonsCount: 1,
      discovered: '29 July 2005 (announced 2006)', discoveredBy: 'M. Brown, C. Trujillo, D. Rabinowitz (Caltech)',
      atmosphere: 'N₂ and CH₄ ice sublimation atmosphere that freezes out near aphelion',
      blurb: 'Eris is the most massive known dwarf planet — slightly smaller than Pluto but 27% heavier, a ballast of rock under a methane-nitrogen-ice shell. Its discovery forced the IAU to define “planet” in 2006 and demote Pluto.',
      world: 'Its moon Dysnomia (“lawless goddess”) gave the mass. Occultation chords in 2010 measured its true size, showing it is bigger than Pluto in radius… barely.',
      dayInfo: 'One Eris year lasts 572 Earth years; it is now receding toward an aphelion of 97 AU.',
      moonNote: null
    },
    {
      id: 'makemake', name: 'Makemake', kind: 'dwarf', color: '#d98f6b', tex: 'makemake.jpg',
      orbit: [45.456, 0.4511, 28.993, 153.3, 296.785 + 288.36, 296.785, 0, 0, 0, 0, 0, 0],
      orbitSource: 'osculating-j2000',
      radiusKm: 715, massKg: 3.28e21, massEarths: 0.00055, density: 1.96,
      gravity: 0.50, escapeVel: 0.85, rotPeriodH: 22.5, rotNote: '~22.5 h',
      tiltDeg: 29, albedo: 0.83, tempC: '−239',
      orbitalPeriodD: 111020, periodY: 304.7, periAU: 38.14, apoAU: 52.77, velKms: 3.5, moonsCount: 1,
      discovered: '31 March 2005', discoveredBy: 'Brown, Trujillo, Rabinowitz (same team as Eris)',
      atmosphere: 'Very faint, transient CH₄ atmosphere near perihelion',
      blurb: 'Makemake is the second-brightest object beyond Neptune — a reddish methane-ice world in a 305-year orbit that keeps ~90% of its volatiles frozen even at perihelion. It is named after a Rapa Nui creator god.',
      world: 'Its tiny dark moon MK 2 ("MK2", nicknamed from the camera) was found by Hubble in 2016. Stellar occultations show a surprisingly round, airless body.',
      dayInfo: 'Discovered within weeks of Eris’ detection date — the pair together ended Pluto’s planethood.',
      moonNote: null
    },
    {
      id: 'haumea', name: 'Haumea', kind: 'dwarf', color: '#e8e4da', tex: 'haumea.jpg',
      orbit: [43.13, 0.1931, 28.213, 256, 122.33 + 239.18, 122.33, 0, 0, 0, 0, 0, 0],
      orbitSource: 'osculating-j2000',
      radiusKm: 782.5, massKg: 4.0e21, massEarths: 0.00067, density: 1.88,
      gravity: 0.44, escapeVel: 1.0, rotPeriodH: 3.915, rotNote: '3.9 h — fastest rotation of any large body',
      tiltDeg: 42, albedo: 0.72, tempC: '−241',
      orbitalPeriodD: 103008, periodY: 282.3, periAU: 34.86, apoAU: 51.40, velKms: 3.6, moonsCount: 2,
      discovered: '28 December 2004 (announced 2008)', discoveredBy: 'dispute: Caltech (Brown et al.) vs. Sierra Nevada Obs. (Ortiz et al.)',
      atmosphere: 'Possible transient N₂, like Pluto',
      blurb: 'Haumea is the fastest-spinning large object known — a 4-hour rotation has stretched it into an American-football ellipsoid 50% longer across than through its short axes, all crystalline water ice. Its 4-hour day is near the breakup limit for a rubble pile.',
      world: 'Two moons, Hiʻiaka and Namaka, plus a remarkable collisional family of reddish Trans-Neptunian objects sharing Haumea’s orbit — evidence of a giant impact billions of years ago that shredded its parent body.',
      dayInfo: 'A Haumea day is 3 h 56 m: spun to a triaxial ellipsoid at the edge of rotational breakup.',
      moonNote: null
    }
  ];

  // ---- Major moons -----------------------------------------------------------
  // orbit: [a km, period days (negative = retrograde), e, inclination° (to the
  // parent's equator, or ecliptic for the Moon), mean longitude at J2000 °].
  // Periods and radii from NASA planetary satellite fact sheets.
  const moons = [
    { id: 'moon', name: 'Moon', parent: 'earth', color: '#cfcfcf', tex: 'moon.jpg',
      orbit: [384400, 27.321661, 0.0549, 5.145, 218.32], radiusKm: 1737.4, tidallyLocked: true,
      gravity: 1.62, tempC: '−173 … 127',
      blurb: 'The Moon formed from debris of a Mars-sized impact on the early Earth. Its stabilising gravity steadies our axial tilt, its tides shaped coastal evolution, and it is the only world beyond Earth walked on by humans (12 astronauts, 1969–72).' },
    { id: 'phobos', name: 'Phobos', parent: 'mars', color: '#8a7a6d', tex: 'phobos.jpg',
      orbit: [9376, 0.31891, 0.0151, 1.08, 0], radiusKm: 11.27, tidallyLocked: true, gravity: 0.0057, tempC: '−40',
      blurb: 'Phobos orbits so low (9,376 km) and fast (7 h 39 m — 2.7× per Martian day) that it rises in the west and sets in the east twice a day. Tidal friction is spiralling it inward 1.8 cm/yr: in ~50 million years it will break apart into a ring.' },
    { id: 'deimos', name: 'Deimos', parent: 'mars', color: '#9b8b78', tex: 'deimos.jpg',
      orbit: [23463, 1.26244, 0.0002, 1.79, 42], radiusKm: 6.2, tidallyLocked: true, gravity: 0.003, tempC: '−50',
      blurb: 'Deimos is a 12-km-wide tumbling rock, likely a captured asteroid. It drifts slowly outward and will escape Mars in several billion years. From the surface it looks like a slowly-moving bright star.' },
    { id: 'io', name: 'Io', parent: 'jupiter', color: '#e0c26a', tex: 'io.jpg',
      orbit: [421700, 1.769138, 0.0041, 0.05, 343.6], radiusKm: 1821.6, tidallyLocked: true, gravity: 1.798, tempC: '−143 (hotspots 1,600+)',
      blurb: 'Io is the most volcanically active world in the Solar System — squeezed by the Laplace resonance with Europa and Ganymede, its interior generates 100 trillion watts of tidal heat that drives 400 active volcanoes with lava lakes and 300 km tall plumes. Its surface is continually resurfaced sulfur and SO₂ frost; there is not a single impact crater.' },
    { id: 'europa', name: 'Europa', parent: 'jupiter', color: '#d9c9a8', tex: 'europa.jpg',
      orbit: [671034, 3.551181, 0.009, 0.47, 123.3], radiusKm: 1560.8, tidallyLocked: true, gravity: 1.315, tempC: '−160',
      blurb: 'Beneath Europa’s cracked, ridged ice shell lies a salt-water ocean twice the volume of all Earth’s oceans, kept liquid by tidal heating and in contact with a rocky seafloor — making it the top candidate for life beyond Earth. Plume eruptions were observed in 2022.' },
    { id: 'ganymede', name: 'Ganymede', parent: 'jupiter', color: '#a89b8c', tex: 'ganymede.jpg',
      orbit: [1070412, 7.154553, 0.0013, 0.20, 252.5], radiusKm: 2634.1, tidallyLocked: true, gravity: 1.428, tempC: '−163',
      blurb: 'Ganymede is the largest moon in the Solar System — bigger than Mercury — and the only moon with its own magnetic field and a subsurface ocean sandwiched between ice layers. Galileo found a saltwater ocean 100 km down.' },
    { id: 'callisto', name: 'Callisto', parent: 'jupiter', color: '#7d7161', tex: 'callisto.jpg',
      orbit: [1882709, 16.689018, 0.0074, 0.28, 3.2], radiusKm: 2410.3, tidallyLocked: true, gravity: 1.236, tempC: '−139',
      blurb: 'Callisto is the most heavily cratered object known — a 4-billion-year-old frozen relic almost untouched by geology, dominated by the enormous multi-ring Valhalla basin. It may hide a salty ocean deepest of all the Galileans, and is the calmest candidate for a future Jovian base.' },
    { id: 'titan', name: 'Titan', parent: 'saturn', color: '#d8a85f', tex: 'titan.jpg',
      orbit: [1221830, 15.945, 0.0288, 0.35, 292.4], radiusKm: 2574.7, tidallyLocked: true, gravity: 1.352, tempC: '−179',
      blurb: 'Titan is the only moon with a substantial atmosphere — 1.5× Earth-surface pressure of nitrogen with methane clouds, methane rain, rivers and seas of liquid ethane and propane, dune seas of organic sand, and a water-rock core with a subsurface water ocean. Dragonfly will hop across its dunes in 2028.' },
    { id: 'rhea', name: 'Rhea', parent: 'saturn', color: '#cfd2d4', tex: 'rhea.jpg',
      orbit: [527108, 4.518212, 0.0012, 0.35, 0], radiusKm: 763.8, tidallyLocked: true, gravity: 0.264, tempC: '−174',
      blurb: 'Rhea is Saturn’s second-largest moon, a dirty snowball almost entirely water ice, with a thin CO₂/O₂ exosphere and maybe a tenuous ring of its own. Its leading hemisphere is heavily cratered; the trailing side is bizarrely streaked and smooth.' },
    { id: 'iapetus', name: 'Iapetus', parent: 'saturn', color: '#b5a68f', tex: 'iapetus.jpg',
      orbit: [3560820, 79.322, 0.0286, 8.0, 0], radiusKm: 734.5, tidallyLocked: true, gravity: 0.223, tempC: '−143 … −114 (leading side warmer)',
      blurb: 'Iapetus wears the Solar System’s most extreme two-tone paint job: its leading hemisphere is coal-dark (forward-scattered material from Phoebe), its trailing side snow-bright — a 10:1 albedo jump. A 20 km equatorial ridge runs its whole circumference like a squeezed beach ball, for reasons still debated.' },
    { id: 'mimas', name: 'Mimas', parent: 'saturn', color: '#c8ccce', tex: 'mimas.jpg',
      orbit: [185539, 0.9412, 0.0202, 1.5, 0], radiusKm: 198.2, tidallyLocked: true, gravity: 0.064, tempC: '−182',
      blurb: 'Mimas is “Death Star” moon: Herschel crater is 130 km across on a 396 km world — an impact that nearly shattered it. Its orbital resonance with Titan flexes it enough to have kept a subsurface ocean until recently.' },
    { id: 'enceladus', name: 'Enceladus', parent: 'saturn', color: '#eef4f6', tex: 'enceladus.jpg',
      orbit: [238020, 1.370212, 0.0047, 0.02, 0], radiusKm: 252.1, tidallyLocked: true, gravity: 0.113, tempC: '−198 (plume vents: hot)',
      blurb: 'Enceladus is a 500 km ice grain that shoots 100 kg/s of water, silica nanoparticles and organic molecules from tiger-stripe fractures at its south pole into a 400,000 km plume that feeds Saturn’s E ring. Cassini flew through it and found hydrothermal chemistry — an ocean vent system, today, with all the ingredients for life.' },
    { id: 'dione', name: 'Dione', parent: 'saturn', color: '#c5c9cc', tex: 'dione.jpg',
      orbit: [377396, 2.736915, 0.0022, 0.02, 0], radiusKm: 561.4, tidallyLocked: true, gravity: 0.223, tempC: '−186',
      blurb: 'Dione is a differentiated ice moon with a wispy terrain of huge tectonic scarps and a thin oxygen exosphere. Cassini detected a possible subsurface ocean and occasional cryovolcanic fractures.' },
    { id: 'tethys', name: 'Tethys', parent: 'saturn', color: '#d3d8da', tex: 'tethys.jpg',
      orbit: [294619, 1.887802, 0.0001, 1.12, 0], radiusKm: 531.1, tidallyLocked: true, gravity: 0.147, tempC: '−187',
      blurb: 'Tethys is nearly pure water ice, split by the colossal Odysseus impact crater and an even larger canyon system, Ithaca Chasma, which wraps 3/4 of the moon — formed as its interior froze and cracked.' },
    { id: 'hyperion', name: 'Hyperion', parent: 'saturn', color: '#c9a97e', tex: 'hyperion.jpg',
      orbit: [1481010, 21.283, 0.123, 0.6, 0], radiusKm: 135.2, tidallyLocked: false, rotPeriodH: 319.2, gravity: 0.037, tempC: '−189',
      blurb: 'Hyperion is the largest known non-tidally-locked body: an irregular, low-density “sea sponge” of ice whose chaotic tumbling rotation is unpredictable even in principle beyond a few months — a real-world three-body toy solved by Voyager 2 images and Poincaré.' },
    { id: 'phoebe', name: 'Phoebe', parent: 'saturn', color: '#6f6a63', tex: 'phoebe.jpg',
      orbit: [12947780, -550.311, 0.156, 173.0, 0], radiusKm: 106.5, tidallyLocked: false, rotPeriodH: 9.32, gravity: 0.06, tempC: '−182',
      blurb: 'Phoebe orbits backwards at 12.9 million km — a captured Centaur from the Kuiper belt, dark and carbon-rich with a thin icy mantle, whose ejected dust darkens Iapetus’ leading face. Cassini imaged its potato shape and steep topography.' },
    { id: 'miranda', name: 'Miranda', parent: 'uranus', color: '#b9c2c6', tex: 'miranda.jpg',
      orbit: [129390, 1.413479, 0.0013, 4.34, 0], radiusKm: 235.8, tidallyLocked: true, gravity: 0.079, tempC: '−187',
      blurb: 'Miranda is the most violently scarred moon known: Verona Rupes is a 20 km cliff — the tallest on any solid world. Its surface looks like mismatched jigsaw patches of wildly different terrains, perhaps from tidal heating resonances or a shattered-and-reaccreted past.' },
    { id: 'ariel', name: 'Ariel', parent: 'uranus', color: '#c3cace', tex: 'ariel.jpg',
      orbit: [265600, 2.520381, 0.0012, 0.04, 0], radiusKm: 578.9, tidallyLocked: true, gravity: 0.27, tempC: '−184',
      blurb: 'Ariel is the brightest and geologically youngest Uranian moon — its cratered plains are cut by a wild web of canyons and flows of low-viscosity material, evidence for cryovolcanism in a not-too-distant past.' },
    { id: 'umbriel', name: 'Umbriel', parent: 'uranus', color: '#8f9598', tex: 'umbriel.jpg',
      orbit: [362742, 4.1438, 0.0039, 0.13, 0], radiusKm: 584.7, tidallyLocked: true, gravity: 0.218, tempC: '−204',
      blurb: 'Umbriel is the darkest of the major Uranian moons, an ancient cratered sphere whose only bright feature is a mysterious white ring — a young crater floor deposit, or an old cryovolcanic caldera — near its south pole.' },
    { id: 'titania', name: 'Titania', parent: 'uranus', color: '#a7adb2', tex: 'titania.jpg',
      orbit: [435910, 8.705876, 0.0011, 0.34, 0], radiusKm: 788.9, tidallyLocked: true, gravity: 0.379, tempC: '−203',
      blurb: 'Titania, largest of Uranus’ moons, carries Messina Chasma — a 1,500 km canyon system with 5–10 km escarpments — and giant crater floors flooded by pale cryolava, marking an active frozen past.' },
    { id: 'oberon', name: 'Oberon', parent: 'uranus', color: '#9aa0a4', tex: 'oberon.jpg',
      orbit: [583520, 13.463234, 0.0014, 0.06, 0], radiusKm: 761.4, tidallyLocked: true, gravity: 0.346, tempC: '−201',
      blurb: 'Oberon is the outermost major Uranian moon: dark red-tinged, ancient and cratered, with craters ringed by mysterious dark floor deposits that may be carbon-rich cryomagma that wellied up after impacts.' },
    { id: 'proteus', name: 'Proteus', parent: 'neptune', color: '#8b8680', tex: 'proteus.jpg',
      orbit: [117647, 1.431, 0.0005, 0.5, 0], radiusKm: 204, tidallyLocked: true, gravity: 0.053, tempC: '−235',
      blurb: 'Proteus is a lumpy 400 km-wide object — the largest known body that never rounded itself into a sphere, its shape limited by its own modest gravity. Its crater Pharos spans a quarter of its diameter.' },
    { id: 'charon', name: 'Charon', parent: 'pluto', color: '#b8b3ac', tex: 'charon.jpg',
      orbit: [19591, 6.387230, 0.0002, 0.08, 0], radiusKm: 606, tidallyLocked: true, gravity: 0.288, tempC: '−220',
      blurb: 'Charon is half Pluto’s size — so large that both bodies orbit a barycentre in free space. Its south pole carries Serenity Chasma, a 1,500 km canyon system up to 9 km deep, and a startling dark-red polar cap ("Mordor Macula") of ancient frozen methane.' },
    { id: 'triton', name: 'Triton', parent: 'neptune', color: '#cfd6dd', tex: 'triton.jpg',
      orbit: [354759, -5.876854, 0.000016, 156.865, 0], radiusKm: 1353.4, tidallyLocked: true, gravity: 0.779, tempC: '−235 (coldest known solid surfaces)',
      blurb: 'Triton orbits backwards — a captured Kuiper-belt dwarf planet — and is geologically active today: Voyager 2 saw nitrogen geysers erupting 8 km through black “smoke” streaks across a cantaloupe-terrain of sublimating ice. Its thin nitrogen atmosphere is warming as it nears southern summer. Tides are decaying its orbit: in ~3–5 Gyr it will be torn into a ring.' }
  ];

  return { sun: sun, planets: planets, dwarfPlanets: dwarfPlanets, moons: moons };
})();
