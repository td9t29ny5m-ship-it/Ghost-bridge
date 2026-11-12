/*
 * Yum Empire — original icon art, drawn in code as SVG (no emoji, no image files).
 * Style: chunky dark outline, flat colour, a soft highlight and a soft shade.
 *
 *   Icons.svg(name, cls)   → inline <svg> markup for the interface
 *   Icons.url(name)        → data: URL (for canvas textures in the 3D world)
 *   Icons.chef(member)     → a chef portrait, generated from the chef's id
 *   Icons.hydrate(root)    → fills every <i data-ic="name"></i> in the page
 */
(function () {
  'use strict';
  const OL = '#2b1d3a';
  const S = (w) => `stroke="${OL}" stroke-width="${w || 3.5}" stroke-linejoin="round" stroke-linecap="round"`;
  const SHINE = 'fill="#fff" opacity=".45"';
  const SHADE = 'fill="#000" opacity=".16"';
  // Draws shapes as one merged silhouette: a thick dark outline behind, the fill on top.
  const blobs = (shapes, fill) => `<g fill="${OL}" stroke="${OL}" stroke-width="7" stroke-linejoin="round">${shapes}</g><g fill="${fill}">${shapes}</g>`;
  function starPts(cx, cy, R, r, n) {
    const pts = [];
    for (let k = 0; k < n * 2; k++) {
      const a = -Math.PI / 2 + k * Math.PI / n, rad = k % 2 ? r : R;
      pts.push((cx + Math.cos(a) * rad).toFixed(1) + ',' + (cy + Math.sin(a) * rad).toFixed(1));
    }
    return pts.join(' ');
  }
  function gearPath(cx, cy, R, r, n) {
    let d = '';
    for (let k = 0; k < n; k++) {
      const a0 = (k / n) * Math.PI * 2, w = Math.PI / n * 0.55;
      const p = (a, rad) => (cx + Math.cos(a) * rad).toFixed(1) + ' ' + (cy + Math.sin(a) * rad).toFixed(1);
      d += (k ? 'L' : 'M') + p(a0 - w, r) + 'L' + p(a0 - w * 0.7, R) + 'L' + p(a0 + w * 0.7, R) + 'L' + p(a0 + w, r);
    }
    return d + 'Z';
  }
  const dollar = (x, y, s, col) => `<path transform="translate(${x} ${y}) scale(${s})" d="M3.4-4.6c-.8-1.4-2.2-2-3.6-2-2 0-3.4 1.1-3.4 2.7 0 3.8 7.4 2 7.4 5.6 0 1.7-1.6 2.9-3.7 2.9-1.6 0-3-.7-3.8-2M0-8.4v2M0 4.6v2" fill="none" stroke="${col}" stroke-width="2.4" stroke-linecap="round"/>`;

  const A = {
    // ---------- Currencies ----------
    cash: `<rect x="5" y="25" width="46" height="26" rx="5" fill="#2f9e55" ${S()} transform="rotate(-10 28 38)"/>
      <rect x="12" y="15" width="47" height="29" rx="5" fill="#57d97c" ${S()}/>
      <rect x="17" y="20" width="37" height="19" rx="3" fill="none" stroke="#2f9e55" stroke-width="2.2"/>
      <circle cx="35.5" cy="29.5" r="8" fill="#2f9e55"/>${dollar(35.5, 30, 1, '#eaffd8')}
      <rect x="15" y="18" width="14" height="3" rx="1.5" ${SHINE}/>`,
    gem: `<path d="M12 25 21 12H43L52 25 32 55Z" fill="#33c3ff" ${S()}/>
      <path d="M21 12 27 25H12Z" fill="#b5f0ff"/><path d="M27 25H37L32 55Z" fill="#86e0ff"/><path d="M43 12 37 25H52Z" fill="#1d8fd1"/><path d="M37 25H52L32 55Z" fill="#1aa3e8"/>
      <path d="M12 25H52M21 12 27 25 32 55 37 25 43 12" fill="none" stroke="${OL}" stroke-width="2.4" stroke-linejoin="round"/>
      <path d="M12 25 21 12H43L52 25 32 55Z" fill="none" ${S()}/>`,
    star: `<polygon points="${starPts(32, 34, 27, 12.5, 5)}" fill="#ffcf2e" ${S()}/>
      <polygon points="${starPts(32, 34, 27, 12.5, 5)}" fill="#ffe680" transform="translate(32 34) scale(.55) translate(-32 -36)"/>
      <path d="M22 26 28 24" stroke="#fff" stroke-width="3.5" stroke-linecap="round" opacity=".7"/>`,
    xp: `<path d="M37 5 14 36H30L25 59 51 26H35Z" fill="#43e0ff" ${S()}/><path d="M35 12 22 31H29Z" ${SHINE}/>`,
    coin: `<circle cx="32" cy="34" r="24" fill="#d99a1c" ${S()}/><circle cx="32" cy="31" r="24" fill="#ffd23f" ${S()}/>
      <circle cx="32" cy="31" r="17" fill="none" stroke="#e0a21e" stroke-width="3"/>${dollar(32, 31.5, 1.5, '#b87400')}
      <path d="M18 22a16 16 0 0 1 10-8" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round" opacity=".7"/>`,

    // ---------- Menus ----------
    quests: `<rect x="14" y="12" width="36" height="42" rx="3" fill="#fff1c9" ${S()}/>
      <rect x="9" y="7" width="46" height="10" rx="5" fill="#e0b062" ${S()}/><rect x="9" y="49" width="46" height="10" rx="5" fill="#e0b062" ${S()}/>
      <path d="M20 26H44M20 33H44M20 40H34" stroke="#c99a55" stroke-width="3.2" stroke-linecap="round"/>
      <circle cx="43" cy="43" r="6" fill="#e8453c" ${S(3)}/><path d="M43 49 40 56M43 49 46 56" stroke="#e8453c" stroke-width="3" stroke-linecap="round"/>`,
    shop: `<rect x="10" y="27" width="44" height="28" fill="#fff3dc" ${S()}/>
      <rect x="27" y="37" width="11" height="18" fill="#8a5a3c" ${S(3)}/><rect x="14" y="33" width="9" height="9" fill="#8fd6ff" ${S(3)}/><rect x="42" y="33" width="9" height="9" fill="#8fd6ff" ${S(3)}/>
      <path d="M6 15H58V24C58 28 54.8 30 52.4 30 50 30 47.2 28 47.2 24 47.2 28 44.4 30 41.6 30 38.8 30 36.2 28 36.2 24 36.2 28 33.6 30 30.8 30S25.2 28 25.2 24C25.2 28 22.6 30 19.8 30S14.4 28 14.4 24C14.4 28 11.6 30 9.6 30 7.6 30 6 28 6 24Z" fill="#ff5a4e" ${S()}/>
      <path d="M17 16V26M28 16V26M39 16V26M50 16V26" stroke="#fff" stroke-width="5" opacity=".9"/>
      <path d="M6 15H58V24C58 28 54.8 30 52.4 30 50 30 47.2 28 47.2 24 47.2 28 44.4 30 41.6 30 38.8 30 36.2 28 36.2 24 36.2 28 33.6 30 30.8 30S25.2 28 25.2 24C25.2 28 22.6 30 19.8 30S14.4 28 14.4 24C14.4 28 11.6 30 9.6 30 7.6 30 6 28 6 24Z" fill="none" ${S()}/>
      <rect x="10" y="8" width="44" height="8" rx="2" fill="#ffcf3a" ${S()}/>`,
    trophy: `<path d="M20 15H12C12 26 16 30 22 31M44 15H52C52 26 48 30 42 31" fill="none" ${S(4.5)}/>
      <path d="M19 9H45V24C45 33 39 39 32 39S19 33 19 24Z" fill="#ffcf2e" ${S()}/><rect x="28.5" y="38" width="7" height="9" fill="#e0a21e" ${S(3)}/>
      <rect x="18" y="46" width="28" height="10" rx="2.5" fill="#8a5a3c" ${S()}/><rect x="25" y="49" width="14" height="4" rx="1" fill="#ffcf2e"/>
      <rect x="24" y="13" width="5" height="17" rx="2.5" ${SHINE}/>`,
    rocket: `<path d="M24 40 13 50 23 49ZM40 40 51 50 41 49Z" fill="#ff4d5e" ${S()}/>
      <path d="M26 46Q32 64 38 46Z" fill="#ffb23d" ${S(3)}/><path d="M29 46Q32 56 35 46Z" fill="#fff07a"/>
      <path d="M32 5C43 13 46 29 41 46H23C18 29 21 13 32 5Z" fill="#f2f4ff" ${S()}/><path d="M32 5C36 8 39 12 41 17H23C25 12 28 8 32 5Z" fill="#ff4d5e" ${S(3)}/>
      <circle cx="32" cy="27" r="6" fill="#4fc3ff" ${S(3)}/><circle cx="30" cy="25" r="2" fill="#fff"/><path d="M26 33V42" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".8"/>`,
    gift: `<path d="M32 21C27 9 15 10 18 17 20 21 27 21 32 21ZM32 21C37 9 49 10 46 17 44 21 37 21 32 21Z" fill="#ffd23f" ${S()}/>
      <rect x="11" y="29" width="42" height="27" rx="2" fill="#ff4d6d" ${S()}/><rect x="7" y="20" width="50" height="11" rx="2" fill="#ff6f8a" ${S()}/>
      <rect x="28" y="20" width="8" height="36" fill="#ffd23f" ${S(3)}/><rect x="13" y="32" width="12" height="3" ${SHADE}/><rect x="10" y="22" width="14" height="3" rx="1.5" ${SHINE}/>`,
    bag: `<path d="M23 24V18A9 9 0 0 1 41 18V24" fill="none" ${S(4.5)}/>
      <path d="M11 22H53L49 57H15Z" fill="#b56cff" ${S()}/><path d="M11 22H53L52 30H12Z" fill="#9248e6"/><path d="M11 22H53L49 57H15Z" fill="none" ${S()}/>
      <circle cx="23" cy="29" r="2.6" fill="${OL}"/><circle cx="41" cy="29" r="2.6" fill="${OL}"/><rect x="18" y="36" width="5" height="15" rx="2.5" ${SHINE}/>`,
    chefhat: blobs('<circle cx="21" cy="25" r="11"/><circle cx="32" cy="18" r="13"/><circle cx="43" cy="25" r="11"/><rect x="20" y="26" width="24" height="22" rx="3"/>', '#ffffff') +
      `<rect x="18" y="42" width="28" height="12" rx="3" fill="#e9edf6" ${S()}/><path d="M26 30V40M32 28V40M38 30V40" stroke="#d3d9e6" stroke-width="3" stroke-linecap="round"/><circle cx="27" cy="15" r="4" ${SHINE}/>`,
    flask: `<path d="M25 7H39M27 9V24L13 49C11 53 14 57 18 57H46C50 57 53 53 51 49L37 24V9" fill="#e9f4ff" ${S()}/>
      <path d="M17.6 41H46.4L50.7 48.6C52.4 52 50 55.5 46 55.5H18C14 55.5 11.6 52 13.3 48.6Z" fill="#3ddc84"/>
      <path d="M27 9V24L13 49C11 53 14 57 18 57H46C50 57 53 53 51 49L37 24V9" fill="none" ${S()}/><rect x="23" y="5" width="18" height="6" rx="3" fill="#b9c7dd" ${S(3)}/>
      <circle cx="27" cy="47" r="3" fill="#b6ffd3"/><circle cx="37" cy="50" r="2" fill="#b6ffd3"/><circle cx="33" cy="34" r="2.5" fill="#3ddc84" ${S(2)}/><circle cx="28" cy="27" r="1.8" fill="#3ddc84" ${S(2)}/>`,
    city: `<rect x="6" y="28" width="16" height="28" fill="#7f9cff" ${S()}/><rect x="40" y="22" width="18" height="34" fill="#a3b6ff" ${S()}/>
      <rect x="19" y="10" width="22" height="46" fill="#ffcf3a" ${S()}/><path d="M30 4V10" ${S(3)}/>
      <path d="M24 17H28M33 17H36M24 25H28M33 25H36M24 33H28M33 33H36M24 41H28M33 41H36M10 35H13M15 35H18M10 43H13M15 43H18M45 29H48M51 29H54M45 37H48M51 37H54M45 45H48M51 45H54" stroke="#3b4a8a" stroke-width="3.2" stroke-linecap="round"/>
      <rect x="4" y="55" width="56" height="4" rx="2" fill="${OL}"/>`,
    map: `<path d="M7 14 21 8 43 14 57 8V50L43 56 21 50 7 56Z" fill="#9be38a" ${S()}/><path d="M21 8V50M43 14V56" stroke="${OL}" stroke-width="2.4"/>
      <path d="M21 8 43 14V56L21 50Z" fill="#000" opacity=".1"/><path d="M8 40C14 36 18 44 21 41V50L7 56Z" fill="#5ec8ff"/>
      <path d="M7 14 21 8 43 14 57 8V50L43 56 21 50 7 56Z" fill="none" ${S()}/>
      <path d="M32 40C26 32 24 28 24 25A8 8 0 0 1 40 25C40 28 38 32 32 40Z" fill="#ff4d5e" ${S(3)}/><circle cx="32" cy="25" r="3" fill="#fff"/>`,
    medal: `<path d="M21 30 13 56 22 51 26 59 32 36ZM43 30 51 56 42 51 38 59 32 36Z" fill="#4d8bff" ${S()}/>
      <circle cx="32" cy="27" r="19" fill="#ffcf2e" ${S()}/><circle cx="32" cy="27" r="13" fill="#ffe680"/>
      <polygon points="${starPts(32, 28, 10, 4.5, 5)}" fill="#f0a500" ${S(2)}/><path d="M19 21a14 14 0 0 1 8-8" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".7"/>`,
    manager: `<path d="M12 58C12 44 21 37 32 37S52 44 52 58Z" fill="#3a6ff0" ${S()}/><path d="M26 37 32 46 38 37" fill="#fff" ${S(3)}/>
      <path d="M32 44 29 49 32 58 35 49Z" fill="#ff4d5e" ${S(2.5)}/><circle cx="32" cy="22" r="12" fill="#ffd2a8" ${S()}/>
      <path d="M20 21C20 12 26 9 32 9S44 12 44 21C40 17 36 15 30 16 26 17 23 19 20 21Z" fill="#5a3825" ${S(3)}/>
      <circle cx="27.5" cy="24" r="1.8" fill="${OL}"/><circle cx="36.5" cy="24" r="1.8" fill="${OL}"/><path d="M28 29Q32 32 36 29" fill="none" ${S(2.4)}/>`,
    plus: `<circle cx="32" cy="32" r="25" fill="#3ddc84" ${S()}/><path d="M32 19V45M19 32H45" stroke="#fff" stroke-width="7" stroke-linecap="round"/>`,
    lock: `<path d="M21 28V20A11 11 0 0 1 43 20V28" fill="none" stroke="${OL}" stroke-width="10"/><path d="M21 28V20A11 11 0 0 1 43 20V28" fill="none" stroke="#b9c3d6" stroke-width="5"/>
      <rect x="13" y="27" width="38" height="29" rx="5" fill="#ffcf2e" ${S()}/><circle cx="32" cy="39" r="4.5" fill="${OL}"/><rect x="30" y="40" width="4" height="9" rx="2" fill="${OL}"/>`,
    up: `<path d="M32 6 56 32H42V57H22V32H8Z" fill="#3ddc84" ${S()}/><path d="M32 13 47 29" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".6"/>`,
    pointer: `<path d="M32 58 8 30H22V6H42V30H56Z" fill="#ffd23f" ${S()}/><path d="M27 11V31" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".7"/>`,
    clock: `<circle cx="32" cy="33" r="24" fill="#fff" ${S()}/><circle cx="32" cy="33" r="18" fill="none" stroke="#e1e6f2" stroke-width="3"/>
      <path d="M32 19V33L41 39" fill="none" stroke="${OL}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="32" cy="33" r="3" fill="#ff4d5e"/>
      <rect x="27" y="4" width="10" height="6" rx="2" fill="#ff4d5e" ${S(3)}/>`,
    warp: `<path d="M6 12 30 32 6 52ZM30 12 54 32 30 52Z" fill="#43e0ff" ${S()}/><rect x="52" y="12" width="7" height="40" rx="2" fill="#43e0ff" ${S()}/><path d="M11 22 22 31" stroke="#fff" stroke-width="3.5" stroke-linecap="round" opacity=".7"/>`,
    land: `<ellipse cx="32" cy="50" rx="27" ry="9" fill="#7ad65a" ${S()}/><ellipse cx="32" cy="48" rx="20" ry="5" fill="#9be38a"/>
      <rect x="29" y="22" width="6" height="28" fill="#8a5a3c" ${S(3)}/><path d="M12 10H52L56 18 52 26H12Z" fill="#ff5a4e" ${S()}/>
      <path d="M19 15H44M19 21H36" stroke="#fff" stroke-width="3" stroke-linecap="round"/>`,
    crane: `<rect x="8" y="52" width="24" height="7" rx="2" fill="#8a8fa6" ${S()}/><path d="M16 14H24V52H16Z" fill="#ffcf2e" ${S()}/>
      <path d="M16 22 24 30M24 22 16 30M16 34 24 42M24 34 16 42" stroke="${OL}" stroke-width="2"/>
      <path d="M6 10H58V17H6Z" fill="#ffcf2e" ${S()}/><path d="M14 10 20 3 26 10" fill="none" ${S(3)}/><rect x="5" y="17" width="9" height="9" fill="#8a8fa6" ${S(3)}/>
      <path d="M50 17V33" stroke="${OL}" stroke-width="2.5"/><path d="M46 33H54V36C54 40 50 42 48 40" fill="none" ${S(3)}/><rect x="40" y="40" width="16" height="10" fill="#ff8a3d" ${S(3)}/>`,
    check: `<circle cx="32" cy="32" r="25" fill="#3ddc84" ${S()}/><path d="M19 33 28 42 45 23" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>`,
    crown: `<path d="M8 22 20 33 32 12 44 33 56 22 51 50H13Z" fill="#ffcf2e" ${S()}/><rect x="11" y="48" width="42" height="9" rx="2" fill="#f0a500" ${S()}/>
      <circle cx="32" cy="38" r="5" fill="#ff4d5e" ${S(2.5)}/><circle cx="20" cy="41" r="3.5" fill="#43e0ff" ${S(2.5)}/><circle cx="44" cy="41" r="3.5" fill="#3ddc84" ${S(2.5)}/>
      <circle cx="8" cy="20" r="4" fill="#ffcf2e" ${S(3)}/><circle cx="32" cy="10" r="4" fill="#ffcf2e" ${S(3)}/><circle cx="56" cy="20" r="4" fill="#ffcf2e" ${S(3)}/>`,
    moon: `<path d="M40 8A24 24 0 1 0 56 42 19 19 0 0 1 40 8Z" fill="#ffe08a" ${S()}/><circle cx="26" cy="38" r="3" fill="#f0c85a"/><circle cx="34" cy="48" r="2" fill="#f0c85a"/>
      <polygon points="${starPts(50, 14, 6, 2.5, 4)}" fill="#fff"/>`,
    gear: `<path d="${gearPath(32, 32, 26, 19, 9)}" fill="#b9c3d6" ${S()}/><circle cx="32" cy="32" r="9" fill="#6c7896" ${S()}/>`,
    heart: `<path d="M32 55C14 42 7 33 7 23 7 15 13 9 20 9 25 9 29 12 32 16 35 12 39 9 44 9 51 9 57 15 57 23 57 33 50 42 32 55Z" fill="#ff4d6d" ${S()}/>
      <path d="M15 19C16 15 19 14 22 14" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".75"/>`,
    sparkle: `<polygon points="${starPts(32, 32, 26, 7, 4)}" fill="#ffd23f" ${S()}/><polygon points="${starPts(50, 14, 8, 2.5, 4)}" fill="#fff" ${S(2)}/>`,
    person: `<path d="M14 58C14 45 22 38 32 38S50 45 50 58Z" fill="#ff8a3d" ${S()}/><circle cx="32" cy="22" r="12" fill="#ffd2a8" ${S()}/>
      <path d="M20 20C21 12 26 9 32 9S43 12 44 20C39 16 27 15 20 20Z" fill="#2b2118" ${S(3)}/>`,
    tray: `<path d="M8 44H56" ${S(4)}/><path d="M10 44A22 22 0 0 1 54 44Z" fill="#dfe6ef" ${S()}/><circle cx="32" cy="18" r="4" fill="#b9c3d6" ${S(3)}/>
      <ellipse cx="32" cy="49" rx="26" ry="5" fill="#8a8fa6" ${S()}/><path d="M18 36A15 15 0 0 1 28 26" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".8"/>`,

    // ---------- Food (one per kind of shop) ----------
    noodle: `<path d="M38 26 56 6M42 28 58 12" stroke="${OL}" stroke-width="7" stroke-linecap="round"/><path d="M38 26 56 6M42 28 58 12" stroke="#c98a4a" stroke-width="3.5" stroke-linecap="round"/>
      <path d="M7 31H57C57 45 46 55 32 55S7 45 7 31Z" fill="#ff5a4e" ${S()}/><rect x="24" y="53" width="16" height="5" rx="2" fill="#d9483d" ${S(3)}/>
      <ellipse cx="32" cy="31" rx="25" ry="6.5" fill="#ffe1a3" ${S()}/>
      <path d="M14 31C17 27 19 34 22 30S27 33 30 29 35 33 38 29" fill="none" stroke="#f0b54a" stroke-width="2.8" stroke-linecap="round"/>
      <ellipse cx="44" cy="30" rx="6" ry="3.5" fill="#fff" ${S(2.4)}/><circle cx="44" cy="30" r="2.2" fill="#ffb02e"/>
      <path d="M13 38C17 46 24 50 30 51" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round" opacity=".6"/><path d="M41 43 50 39" stroke="#fff" stroke-width="3" stroke-linecap="round"/>`,
    dumpling: `<path d="M24 14C22 9 26 6 24 2M34 14C32 9 36 6 34 2" fill="none" stroke="#c9d3e6" stroke-width="3" stroke-linecap="round"/>
      <path d="M6 42C6 27 18 19 32 19S58 27 58 42C58 48 50 50 32 50S6 48 6 42Z" fill="#fff3dc" ${S()}/>
      <path d="M14 30C17 26 21 32 24 26M24 26C27 22 30 30 32 23M32 23C35 22 37 29 40 26M40 26C43 25 45 31 49 29" fill="none" stroke="#e3c79a" stroke-width="3" stroke-linecap="round"/>
      <ellipse cx="32" cy="52" rx="24" ry="5" ${SHADE}/><path d="M12 42C14 46 20 47 26 47" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round"/>`,
    tea: `<path d="M38 3 33 22" stroke="${OL}" stroke-width="8" stroke-linecap="round"/><path d="M38 3 33 22" stroke="#b56cff" stroke-width="4.5" stroke-linecap="round"/>
      <path d="M16 22H48L43 58H21Z" fill="#e8b97c" ${S()}/><path d="M16.8 28H47.2L46 37H18Z" fill="#fff" opacity=".45"/>
      <path d="M14 22C14 14 22 11 32 11S50 14 50 22Z" fill="#f2e6ff" ${S()}/><rect x="12" y="20" width="40" height="5" rx="2.5" fill="#b56cff" ${S(3)}/>
      <circle cx="25" cy="50" r="3.4" fill="#3a2418"/><circle cx="33" cy="52" r="3.4" fill="#3a2418"/><circle cx="40" cy="48" r="3.4" fill="#3a2418"/><circle cx="29" cy="44" r="3.4" fill="#3a2418"/><circle cx="37" cy="42" r="3.4" fill="#3a2418"/>
      <path d="M16 22H48L43 58H21Z" fill="none" ${S()}/>`,
    taco: `<circle cx="18" cy="30" r="7" fill="#51cf66" ${S(3)}/><circle cx="30" cy="25" r="7" fill="#e8453c" ${S(3)}/><circle cx="42" cy="26" r="7" fill="#51cf66" ${S(3)}/><circle cx="50" cy="33" r="6" fill="#ffd23f" ${S(3)}/>
      <circle cx="24" cy="29" r="5" fill="#ffd23f" ${S(2.5)}/><circle cx="37" cy="29" r="5" fill="#8a4b2a" ${S(2.5)}/>
      <path d="M5 50A27 27 0 0 1 59 50Z" fill="#ffc23d" ${S()}/><path d="M12 47A20 20 0 0 1 52 47" fill="none" stroke="#e39b1f" stroke-width="2.5"/>
      <circle cx="20" cy="44" r="1.6" fill="#e39b1f"/><circle cx="32" cy="40" r="1.6" fill="#e39b1f"/><circle cx="44" cy="44" r="1.6" fill="#e39b1f"/>`,
    pizza: `<path d="M9 13 32 59 55 13Z" fill="#ffd23f" ${S()}/><path d="M7 8C20 3 44 3 57 8L55 17C42 12 22 12 9 17Z" fill="#d98a3a" ${S()}/>
      <circle cx="25" cy="24" r="5" fill="#e8453c" ${S(2.5)}/><circle cx="39" cy="26" r="5" fill="#e8453c" ${S(2.5)}/><circle cx="32" cy="40" r="4.5" fill="#e8453c" ${S(2.5)}/>
      <path d="M20 33C19 37 21 39 20 42" fill="none" stroke="#ffb02e" stroke-width="3" stroke-linecap="round"/><path d="M13 10C22 7 30 7 36 7" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" opacity=".6"/>`,
    sushi: `<rect x="8" y="30" width="48" height="24" rx="10" fill="#fff" ${S()}/><path d="M10 47C14 50 50 50 54 47" fill="none" stroke="#dfe6ef" stroke-width="3"/>
      <path d="M6 30C6 20 16 16 32 16S58 20 58 30C58 34 52 35 32 35S6 34 6 30Z" fill="#ff8c5a" ${S()}/>
      <path d="M17 19 21 33M27 17 30 34M37 17 39 34M47 19 47 33" stroke="#ffd2bd" stroke-width="3" stroke-linecap="round"/>
      <rect x="27" y="14" width="10" height="42" rx="2" fill="#1d2b24" ${S(3)}/>`,
    burger: `<path d="M8 28C8 14 19 8 32 8S56 14 56 28Z" fill="#f0a54a" ${S()}/><ellipse cx="22" cy="18" rx="2" ry="1.3" fill="#fff6dc"/><ellipse cx="33" cy="14" rx="2" ry="1.3" fill="#fff6dc"/><ellipse cx="42" cy="20" rx="2" ry="1.3" fill="#fff6dc"/><ellipse cx="28" cy="23" rx="2" ry="1.3" fill="#fff6dc"/>
      <path d="M6 30C10 26 14 34 18 30S26 34 30 30 38 34 42 30 50 34 54 30 58 32 58 32" fill="#51cf66" ${S(3)}/>
      <rect x="7" y="33" width="50" height="10" rx="5" fill="#6b3a22" ${S()}/><path d="M12 33H52L44 41 38 34 32 41 26 34 20 41Z" fill="#ffd23f" ${S(2.5)}/>
      <path d="M8 46H56V50C56 54 53 56 49 56H15C11 56 8 54 8 50Z" fill="#e8963c" ${S()}/><path d="M14 14C17 11 20 10 24 10" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".6"/>`,
    court: `<path d="M8 44H56" ${S(4)}/><path d="M11 44A21 21 0 0 1 53 44Z" fill="#dfe6ef" ${S()}/><circle cx="32" cy="19" r="4" fill="#b9c3d6" ${S(3)}/>
      <ellipse cx="32" cy="49" rx="26" ry="5.5" fill="#9aa3bb" ${S()}/><path d="M19 37A14 14 0 0 1 28 28" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".85"/>
      <path d="M45 6 49 14M53 10 50 16M39 8 44 15" stroke="#ffd23f" stroke-width="3" stroke-linecap="round"/>`,
    factory: `<circle cx="50" cy="9" r="5" fill="#e3e8f2" ${S(2.5)}/><circle cx="56" cy="5" r="3.5" fill="#e3e8f2" ${S(2.5)}/>
      <rect x="45" y="14" width="10" height="44" fill="#c94f3e" ${S()}/><path d="M45 20H55M45 26H55" stroke="#fff" stroke-width="2.5" opacity=".7"/>
      <path d="M6 58V30L18 22V30L30 22V30L42 22V58Z" fill="#e07a5f" ${S()}/>
      <rect x="11" y="38" width="7" height="7" fill="#ffd98a" ${S(2.5)}/><rect x="23" y="38" width="7" height="7" fill="#ffd98a" ${S(2.5)}/><rect x="17" y="49" width="13" height="9" fill="#8a5a3c" ${S(2.5)}/><rect x="34" y="38" width="5" height="7" fill="#ffd98a" ${S(2.5)}/>`,
    globe: `<circle cx="32" cy="31" r="23" fill="#3a86ff" ${S()}/>
      <path d="M17 18C21 15 27 16 27 21S21 25 23 30 19 37 15 33 12 22 17 18ZM34 13C40 12 47 16 48 22S42 26 39 24 36 30 33 26 29 15 34 13ZM36 37C40 34 46 36 47 40S42 49 37 49 32 41 36 37Z" fill="#51cf66" ${S(2.4)}/>
      <ellipse cx="32" cy="31" rx="28" ry="9" fill="none" stroke="${OL}" stroke-width="6" transform="rotate(-20 32 31)"/><ellipse cx="32" cy="31" rx="28" ry="9" fill="none" stroke="#ffd23f" stroke-width="3" transform="rotate(-20 32 31)"/>
      <rect x="27" y="54" width="10" height="6" rx="2" fill="#8a5a3c" ${S(3)}/><path d="M18 20A18 18 0 0 1 26 13" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".6"/>`,

    // ---------- Districts ----------
    suburb: `<circle cx="50" cy="34" r="10" fill="#57c93f" ${S()}/><rect x="48" y="42" width="4" height="12" fill="#8a5a3c" ${S(2.5)}/>
      <rect x="10" y="30" width="32" height="25" fill="#fff1d6" ${S()}/><path d="M5 32 26 12 47 32Z" fill="#e8453c" ${S()}/><rect x="33" y="14" width="6" height="11" fill="#b8493a" ${S(3)}/>
      <rect x="21" y="40" width="10" height="15" fill="#8a5a3c" ${S(3)}/><rect x="13" y="36" width="6" height="6" fill="#8fd6ff" ${S(2.5)}/><rect x="34" y="36" width="6" height="6" fill="#8fd6ff" ${S(2.5)}/>
      <rect x="2" y="54" width="60" height="5" rx="2.5" fill="#7ad65a" ${S(3)}/>`,
    town: `<rect x="32" y="26" width="26" height="30" fill="#e3f1ff" ${S()}/><path d="M28 28 45 12 62 28Z" fill="#4a6fa5" ${S()}/>
      <rect x="6" y="32" width="26" height="24" fill="#fff1d6" ${S()}/><path d="M2 34 19 18 36 34Z" fill="#e07b39" ${S()}/>
      <rect x="15" y="44" width="8" height="12" fill="#8a5a3c" ${S(2.5)}/><rect x="40" y="34" width="6" height="6" fill="#8fd6ff" ${S(2.5)}/><rect x="48" y="34" width="6" height="6" fill="#8fd6ff" ${S(2.5)}/><rect x="40" y="44" width="6" height="6" fill="#8fd6ff" ${S(2.5)}/><rect x="48" y="44" width="6" height="6" fill="#8fd6ff" ${S(2.5)}/>
      <rect x="2" y="55" width="60" height="5" rx="2.5" fill="#5ec8ff" ${S(3)}/>`,
    metro: `<circle cx="50" cy="12" r="7" fill="#ffe08a" ${S(3)}/>
      <rect x="4" y="30" width="15" height="27" fill="#6b4fd6" ${S()}/><rect x="42" y="24" width="18" height="33" fill="#4b3aa8" ${S()}/><rect x="18" y="8" width="24" height="49" fill="#2f2470" ${S()}/>
      <path d="M30 2V8" ${S(3)}/><path d="M18 8V57" stroke="#ff4fd8" stroke-width="2.5"/><path d="M42 24V57" stroke="#3df5ff" stroke-width="2.5"/>
      <path d="M23 16H27M33 16H37M23 24H27M33 24H37M23 32H27M33 32H37M23 40H27M33 40H37M8 38H11M13 38H16M8 46H11M13 46H16M46 32H49M53 32H56M46 40H49M53 40H56" stroke="#ffd98a" stroke-width="3" stroke-linecap="round"/>
      <rect x="2" y="56" width="60" height="4" rx="2" fill="${OL}"/>`,

    // ---------- v3: park buildings and resources ----------
    ingredients: `<path d="M8 30H56L51 56H13Z" fill="#c98a4a" ${S()}/><path d="M10 38H54M12 47H52" stroke="#9c6630" stroke-width="2.6"/>
      <circle cx="21" cy="25" r="9" fill="#ff4d4d" ${S()}/><path d="M21 16C20 12 23 10 26 11" fill="none" stroke="#3a9e4a" stroke-width="3" stroke-linecap="round"/>
      <path d="M30 28C31 15 40 9 46 9 45 19 39 27 30 28Z" fill="#ff922b" ${S()}/><path d="M44 9C46 6 50 6 52 8M45 10C48 9 51 11 51 13" fill="none" stroke="#3a9e4a" stroke-width="3" stroke-linecap="round"/>
      <circle cx="44" cy="27" r="6" fill="#7bd04f" ${S(3)}/><circle cx="18" cy="22" r="2.5" ${SHINE}/>`,
    hall: `<rect x="8" y="30" width="48" height="26" fill="#fff1d6" ${S()}/><path d="M4 32 32 12 60 32Z" fill="#e8453c" ${S()}/>
      <rect x="26" y="4" width="12" height="14" fill="#ffcf2e" ${S(3)}/><circle cx="32" cy="11" r="3.5" fill="#fff" ${S(2)}/>
      <rect x="26" y="40" width="12" height="16" rx="5" fill="#8a5a3c" ${S(3)}/><rect x="12" y="37" width="9" height="9" rx="2" fill="#8fd6ff" ${S(2.5)}/><rect x="43" y="37" width="9" height="9" rx="2" fill="#8fd6ff" ${S(2.5)}/>
      <path d="M4 56H60" ${S(4)}/><path d="M14 32 32 19" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".55"/>`,
    table: `<path d="M14 36 10 56M50 36 54 56M22 36V54M42 36V54" ${S(4)}/><path d="M14 36 10 56M50 36 54 56" stroke="#a8713f" stroke-width="2"/>
      <rect x="6" y="28" width="52" height="9" rx="3" fill="#c98a4a" ${S()}/><path d="M10 31H54" stroke="#e5ad6d" stroke-width="2.5"/>
      <rect x="4" y="44" width="16" height="5" rx="2" fill="#a8713f" ${S(3)}/><rect x="44" y="44" width="16" height="5" rx="2" fill="#a8713f" ${S(3)}/>
      <circle cx="26" cy="24" r="5" fill="#ff5a4e" ${S(3)}/><rect x="34" y="18" width="8" height="10" rx="2" fill="#ffd23f" ${S(3)}/>`,
    lamp: `<path d="M32 22V56" stroke="${OL}" stroke-width="7"/><path d="M32 22V56" stroke="#4a5470" stroke-width="3.5"/>
      <rect x="24" y="52" width="16" height="6" rx="2" fill="#4a5470" ${S(3)}/>
      <circle cx="32" cy="16" r="15" fill="#ffe680" opacity=".45"/><path d="M22 18H42L38 6H26Z" fill="#ffd23f" ${S()}/><rect x="24" y="17" width="16" height="5" rx="2" fill="#4a5470" ${S(3)}/>
      <path d="M28 9 27 15" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/>`,
    planter: `<circle cx="20" cy="22" r="7" fill="#ff6b9d" ${S(3)}/><circle cx="32" cy="16" r="7" fill="#ffd23f" ${S(3)}/><circle cx="44" cy="22" r="7" fill="#c77dff" ${S(3)}/>
      <circle cx="20" cy="22" r="2.5" fill="#fff6c7"/><circle cx="32" cy="16" r="2.5" fill="#ff922b"/><circle cx="44" cy="22" r="2.5" fill="#fff6c7"/>
      <path d="M18 30C22 26 28 30 32 26 36 30 42 26 46 30" fill="#57c93f" ${S(3)}/>
      <path d="M10 32H54L48 56H16Z" fill="#e07a5f" ${S()}/><rect x="8" y="30" width="48" height="7" rx="2" fill="#f0957a" ${S(3)}/>`,
    tree: `<rect x="28" y="38" width="8" height="18" fill="#8a5a3c" ${S(3)}/>` + blobs('<circle cx="22" cy="30" r="12"/><circle cx="32" cy="18" r="14"/><circle cx="43" cy="30" r="12"/><circle cx="32" cy="34" r="10"/>', '#57c93f') +
      `<circle cx="27" cy="14" r="4" ${SHINE}/><circle cx="40" cy="36" r="6" ${SHADE}/><ellipse cx="32" cy="57" rx="16" ry="3" ${SHADE}/>`,
    umbrella: `<path d="M32 18V54" ${S(5)}/><path d="M32 18V54" stroke="#e9edf6" stroke-width="2.5"/>
      <path d="M4 26C8 12 20 6 32 6S56 12 60 26C56 23 51 23 46 26 42 23 37 23 32 26 27 23 22 23 18 26 13 23 8 23 4 26Z" fill="#ff5a4e" ${S()}/>
      <path d="M18 26C20 14 26 7 32 6 38 7 44 14 46 26 42 23 37 23 32 26 27 23 22 23 18 26Z" fill="#fff"/>
      <path d="M4 26C8 12 20 6 32 6S56 12 60 26C56 23 51 23 46 26 42 23 37 23 32 26 27 23 22 23 18 26 13 23 8 23 4 26Z" fill="none" ${S()}/>
      <rect x="14" y="44" width="36" height="6" rx="2" fill="#c98a4a" ${S(3)}/><path d="M20 50V58M44 50V58" ${S(3.5)}/>`,
    fountain: `<ellipse cx="32" cy="50" rx="27" ry="8" fill="#b9c3d6" ${S()}/><ellipse cx="32" cy="48" rx="21" ry="5" fill="#4fc3ff"/>
      <rect x="27" y="26" width="10" height="22" fill="#dfe6ef" ${S(3)}/><ellipse cx="32" cy="26" rx="13" ry="4" fill="#b9c3d6" ${S(3)}/>
      <path d="M32 22C32 12 24 8 18 14M32 22C32 12 40 8 46 14M32 22V6" fill="none" stroke="#4fc3ff" stroke-width="4" stroke-linecap="round"/>
      <circle cx="18" cy="18" r="2.5" fill="#4fc3ff"/><circle cx="46" cy="18" r="2.5" fill="#4fc3ff"/>`,
    stage: `<path d="M6 40H58V54H6Z" fill="#8a5a3c" ${S()}/><path d="M6 40H58" stroke="#c98a4a" stroke-width="3"/>
      <path d="M8 40V12H56V40" fill="none" ${S(4)}/><rect x="6" y="8" width="52" height="7" rx="2" fill="#b56cff" ${S(3)}/>
      <path d="M8 15C14 24 18 24 22 15M42 15C46 24 50 24 56 15" fill="#ff4d6d" ${S(3)}/>
      <rect x="11" y="26" width="8" height="14" rx="2" fill="#2b2f45" ${S(3)}/><rect x="45" y="26" width="8" height="14" rx="2" fill="#2b2f45" ${S(3)}/><circle cx="15" cy="33" r="2.5" fill="#8a8fa6"/><circle cx="49" cy="33" r="2.5" fill="#8a8fa6"/>
      <path d="M30 22C30 18 36 18 36 22V30C36 34 30 34 30 30Z" fill="#ffd23f" ${S(2.5)}/><path d="M33 34V40" ${S(2.5)}/>`,
    garden: `<rect x="4" y="22" width="56" height="34" rx="4" fill="#a8713f" ${S()}/><path d="M8 32H56M8 42H56M8 52H56" stroke="#8a5a30" stroke-width="3"/>
      <path d="M14 30C11 24 13 20 16 18M14 30C17 24 20 22 22 22M30 30C27 24 29 20 32 18M30 30C33 24 36 22 38 22M46 30C43 24 45 20 48 18M46 30C49 24 52 22 54 22" fill="none" stroke="#3ddc84" stroke-width="3.5" stroke-linecap="round"/>
      <circle cx="18" cy="40" r="4" fill="#ff4d4d" ${S(2.5)}/><circle cx="34" cy="40" r="4" fill="#ff922b" ${S(2.5)}/><circle cx="50" cy="40" r="4" fill="#ff4d4d" ${S(2.5)}/>
      <path d="M8 10V22M56 10V22M8 14H56" stroke="#fff3dc" stroke-width="3"/><path d="M8 10V22M56 10V22M8 14H56" fill="none" ${S(1.2)}/>`,
    spice: `<path d="M8 56V34C8 28 14 26 18 30 22 26 28 28 28 34V56Z" fill="#e8b45a" ${S()}/><path d="M36 56V36C36 30 42 28 46 32 50 28 56 30 56 36V56Z" fill="#d9663b" ${S()}/>
      <path d="M22 56V26C22 20 28 18 32 22 36 18 42 20 42 26V56Z" fill="#ffd23f" ${S()}/>
      <path d="M10 34C14 30 18 36 26 33M24 26C28 22 34 28 40 25M38 36C42 32 48 37 54 35" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" opacity=".7"/>
      <path d="M26 8 32 14 38 8" fill="none" stroke="#3ddc84" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`,
    fishmkt: `<path d="M8 32C14 20 28 16 40 22L52 14V44L40 36C28 44 14 42 8 32Z" fill="#4fc3ff" ${S()}/>
      <circle cx="18" cy="30" r="3" fill="${OL}"/><circle cx="17" cy="29" r="1" fill="#fff"/><path d="M28 24C30 28 30 32 28 36M34 24C36 28 36 32 34 36" fill="none" stroke="#1d8fd1" stroke-width="2.5" stroke-linecap="round"/>
      <path d="M14 26C18 22 24 21 28 22" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".7"/>
      <rect x="6" y="46" width="52" height="11" rx="3" fill="#dfe6ef" ${S()}/><path d="M12 50H52" stroke="#b9c3d6" stroke-width="3"/>`,
    farm: `<path d="M6 54V26L32 8 58 26V54Z" fill="#c7f0ff" ${S()}/><path d="M32 8V54M6 26H58M6 40H58M19 17V54M45 17V54" stroke="${OL}" stroke-width="2.4" opacity=".55"/>
      <path d="M6 54V26L32 8 58 26V54Z" fill="none" ${S()}/>
      <path d="M14 52C12 46 14 42 18 40M24 52C24 46 26 43 29 42M40 52C38 46 40 43 44 41M50 52C50 46 52 43 54 42" fill="none" stroke="#3ddc84" stroke-width="3.5" stroke-linecap="round"/>
      <path d="M14 22 26 13" stroke="#fff" stroke-width="3.5" stroke-linecap="round" opacity=".8"/>`,
    hammer: `<path d="M30 30 10 50" stroke="${OL}" stroke-width="10" stroke-linecap="round"/><path d="M30 30 10 50" stroke="#c98a4a" stroke-width="6" stroke-linecap="round"/>
      <path d="M24 16 40 6 58 24 48 34 42 28 36 34 30 28 36 22Z" fill="#b9c3d6" ${S()}/><path d="M40 10 54 24" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".6"/>`,
    builder: `<path d="M12 58C12 46 21 40 32 40S52 46 52 58Z" fill="#ff922b" ${S()}/><path d="M24 42 28 58M40 42 36 58" stroke="#ffd23f" stroke-width="3.5"/>
      <circle cx="32" cy="27" r="12" fill="#ffd2a8" ${S()}/><circle cx="27.5" cy="28" r="1.8" fill="${OL}"/><circle cx="36.5" cy="28" r="1.8" fill="${OL}"/><path d="M28 33Q32 36 36 33" fill="none" ${S(2.4)}/>
      <path d="M17 24C17 13 24 8 32 8S47 13 47 24Z" fill="#ffd23f" ${S()}/><rect x="13" y="22" width="38" height="6" rx="3" fill="#ffcf2e" ${S(3)}/><path d="M32 8V22" stroke="#e0a21e" stroke-width="3"/>`,
    move: `<path d="M32 4 41 14H35V29H50V23L60 32 50 41V35H35V50H41L32 60 23 50H29V35H14V41L4 32 14 23V29H29V14H23Z" fill="#43e0ff" ${S()}/>`,
    collect: `<circle cx="22" cy="40" r="15" fill="#d99a1c" ${S()}/><circle cx="22" cy="37" r="15" fill="#ffd23f" ${S()}/>
      <circle cx="42" cy="28" r="15" fill="#d99a1c" ${S()}/><circle cx="42" cy="25" r="15" fill="#ffd23f" ${S()}/>${dollar(42, 25.5, 1, '#b87400')}
      <path d="M50 52 58 44M58 44V52M58 44H50" fill="none" stroke="#3ddc84" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`,

    // ---------- Ingredients ----------
    wheat: `<path d="M32 60V20" stroke="#b07a2a" stroke-width="4" stroke-linecap="round"/>
      ${[[32, 12, 0], [25, 22, -28], [39, 22, 28], [25, 33, -28], [39, 33, 28], [26, 44, -28], [38, 44, 28]].map(([x, y, r]) => `<ellipse cx="${x}" cy="${y}" rx="5" ry="9" transform="rotate(${r} ${x} ${y})" fill="#ffcf4a" ${S(3)}/>`).join('')}
      <path d="M31 9v6" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity=".6"/>`,
    veg: `<path d="M20 22c-6-8-2-15 4-14 0 6 2 9 6 12M33 18c0-9 6-13 11-10-3 5-6 8-9 12M38 22c7-5 14-3 15 3-6 1-10 0-14-1" fill="#3ddc84" ${S(3)}/>
      <path d="M15 27c8-8 26-6 30 2 3 7-10 25-22 30-7 3-11-1-11-7 0-9 0-19 3-25Z" fill="#ff8a2b" ${S()}/>
      <path d="M22 34h8M20 42h7M22 50h6" stroke="#d9641a" stroke-width="2.6" stroke-linecap="round"/><path d="M20 30c4-3 9-4 13-3" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".5"/>`,
    rice: `<path d="M8 32h48c0 14-10 24-24 24S8 46 8 32Z" fill="#e8f1ff" ${S()}/><path d="M8 32h48" stroke="#3a86ff" stroke-width="6"/>
      <path d="M8 32h48c0 14-10 24-24 24S8 46 8 32Z" fill="none" ${S()}/>
      <path d="M12 31c2-12 10-18 20-18s18 6 20 18Z" fill="#fff" ${S()}/>
      ${[[22, 22], [30, 18], [38, 21], [26, 27], [35, 27], [43, 27], [19, 28]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="2.6" ry="1.4" fill="#d6dbe6"/>`).join('')}
      <path d="M44 6 30 30M51 9 36 31" stroke="#8a5a2b" stroke-width="3" stroke-linecap="round"/>`,
    fruit: `<path d="M32 18c-3-7-1-12 3-14" fill="none" stroke="#7a4a2a" stroke-width="3.5" stroke-linecap="round"/>
      <path d="M35 12c6-6 14-5 16 0-6 4-11 4-16 0Z" fill="#3ddc84" ${S(3)}/>
      <path d="M32 20c-6-5-22-4-23 12-1 14 10 26 18 26 3 0 4-2 5-2s2 2 5 2c8 0 19-12 18-26-1-16-17-17-23-12Z" fill="#ff4d5e" ${S()}/>
      <path d="M17 30c1-5 5-8 9-8" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".55"/>`,
    fish: `<path d="M50 32 61 20v24Z" fill="#3a86ff" ${S()}/>
      <path d="M6 32c8-13 22-17 34-12 5 2 9 6 12 12-3 6-7 10-12 12-12 5-26 1-34-12Z" fill="#6fb6ff" ${S()}/>
      <path d="M26 21c4 6 4 16 0 22" fill="none" stroke="#3a86ff" stroke-width="2.6"/><path d="M20 24c-2-6 4-10 10-10l-2 7" fill="#3a86ff" ${S(2.6)}/>
      <circle cx="16" cy="30" r="3.2" fill="#fff" ${S(2)}/><circle cx="16.6" cy="30" r="1.4" fill="${OL}"/>
      <path d="M30 26c6-3 12-2 16 2" stroke="#fff" stroke-width="2.6" stroke-linecap="round" opacity=".6"/>`,
    meat: `<path d="M44 12c6-4 12 2 8 8l-7 7-8-8Z" fill="#fff6e8" ${S()}/><circle cx="52" cy="9" r="5" fill="#fff6e8" ${S(3)}/><circle cx="56" cy="15" r="5" fill="#fff6e8" ${S(3)}/>
      <path d="M38 18c6 3 9 9 7 16-3 12-17 22-28 21C8 54 5 46 9 37c4-10 18-24 29-19Z" fill="#d9483b" ${S()}/>
      <path d="M36 23c3 3 4 7 2 11-3 7-12 13-19 13" fill="none" stroke="#ff8a7a" stroke-width="4" stroke-linecap="round"/>
      <path d="M14 38c2-5 6-9 10-11" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".5"/>`,

    // ---------- Business ----------
    crate: `<path d="M8 22 32 12l24 10v26L32 58 8 48Z" fill="#c98a4a" ${S()}/><path d="M8 22 32 32l24-10M32 32v26" fill="none" ${S(3)}/>
      <path d="M12 30 28 37M12 40 28 47M36 37l16-7M36 47l16-7" stroke="#a36a32" stroke-width="3" stroke-linecap="round"/>
      <path d="M14 20 32 13l18 7" stroke="#fff" stroke-width="2.6" stroke-linecap="round" opacity=".45"/>`,
    bin: `<path d="M14 20h36l-4 36H18Z" fill="#3ddc84" ${S()}/><rect x="10" y="12" width="44" height="9" rx="3" fill="#2fae66" ${S()}/>
      <path d="M26 8h12v4H26Z" fill="#2fae66" ${S(3)}/><path d="M24 28v20M32 28v20M40 28v20" stroke="#2fae66" stroke-width="3.2" stroke-linecap="round"/>
      <path d="M18 24l2 26" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".5"/>`,
    token: `<circle cx="32" cy="35" r="24" fill="#c0392b" ${S()}/><circle cx="32" cy="32" r="24" fill="#ff6b4a" ${S()}/>
      <circle cx="32" cy="32" r="17" fill="#ffb35c" ${S(3)}/>
      <path d="M23 30c0-7 4-10 9-10s9 3 9 10Z" fill="#fff" ${S(2.6)}/><path d="M21 31h22v3H21Z" fill="#fff" ${S(2.6)}/><path d="M26 34v8h12v-8" fill="#fff" ${S(2.6)}/>
      <path d="M17 22a17 17 0 0 1 9-7" stroke="#fff" stroke-width="3.5" stroke-linecap="round" opacity=".6"/>`,
    chart: `<rect x="6" y="8" width="52" height="48" rx="6" fill="#fff" ${S()}/>
      <rect x="14" y="34" width="8" height="15" rx="2" fill="#3a86ff" ${S(2.6)}/><rect x="28" y="24" width="8" height="25" rx="2" fill="#3ddc84" ${S(2.6)}/><rect x="42" y="16" width="8" height="33" rx="2" fill="#ffcf2e" ${S(2.6)}/>
      <path d="M12 30 26 20l12 4 14-10" fill="none" stroke="#ff4d5e" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`,
    receipt: `<path d="M14 6h36v52l-6-4-6 4-6-4-6 4-6-4-6 4Z" fill="#fff" ${S()}/>
      <path d="M21 17h22M21 25h22M21 33h14" stroke="#b9c2d6" stroke-width="3" stroke-linecap="round"/>
      <path d="M21 44h22" stroke="#ff4d5e" stroke-width="3.4" stroke-linecap="round"/><circle cx="43" cy="33" r="3" fill="#ff4d5e"/>`,
    cards: `<rect x="8" y="14" width="28" height="40" rx="5" fill="#b56cff" ${S()} transform="rotate(-14 22 34)"/>
      <rect x="26" y="10" width="28" height="40" rx="5" fill="#ffcf2e" ${S()} transform="rotate(10 40 30)"/>
      <polygon points="${starPts(40, 30, 9, 4, 5)}" fill="#fff" transform="rotate(10 40 30)"/>`,
    farmer: `<path d="M8 30c0-4 10-6 24-6s24 2 24 6-10 6-24 6S8 34 8 30Z" fill="#e0b062" ${S()}/>
      <path d="M18 28c0-12 6-18 14-18s14 6 14 18Z" fill="#ffd27a" ${S()}/><path d="M18 26h28" stroke="#ff4d5e" stroke-width="4"/>
      <path d="M22 36c0 12 4 20 10 20s10-8 10-20" fill="#ffd9b8" ${S()}/><path d="M26 44c4 3 8 3 12 0" stroke="${OL}" stroke-width="2.6" stroke-linecap="round" fill="none"/>`,
    fisher: `<path d="M12 28c0-10 9-18 20-18s20 8 20 18Z" fill="#ffcf2e" ${S()}/><path d="M6 30h52l-4 6H10Z" fill="#ffcf2e" ${S()}/>
      <path d="M22 36c0 12 4 20 10 20s10-8 10-20" fill="#ffd9b8" ${S()}/><path d="M26 44c4 3 8 3 12 0" stroke="${OL}" stroke-width="2.6" stroke-linecap="round" fill="none"/>
      <path d="M20 18c4-4 9-5 13-5" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".6"/>`,
    broom: `<path d="M44 6 30 34" stroke="#a36a32" stroke-width="5" stroke-linecap="round"/>
      <path d="M24 30 38 37 34 58C26 58 14 54 10 48Z" fill="#ffcf4a" ${S()}/><path d="M24 30 38 37" stroke="#ff4d5e" stroke-width="5" stroke-linecap="round"/>
      <path d="M18 46l10 6M22 40l12 6" stroke="#d9a441" stroke-width="2.4" stroke-linecap="round"/>`,

    // ---------- Weather ----------
    sun: `${Array.from({ length: 8 }, (_, i) => `<rect x="29" y="2" width="6" height="12" rx="3" fill="#ffb21f" ${S(2.6)} transform="rotate(${i * 45} 32 32)"/>`).join('')}
      <circle cx="32" cy="32" r="15" fill="#ffd23f" ${S()}/><path d="M24 27a10 10 0 0 1 7-6" stroke="#fff" stroke-width="3.5" stroke-linecap="round" opacity=".7"/>`,
    cloud: `<path d="M16 50c-6 0-10-4-10-10s5-10 10-10c1-9 8-15 17-15 8 0 14 5 16 12 6 0 11 5 11 11s-5 12-11 12Z" fill="#eef3fb" ${S()}/>
      <path d="M22 28c2-5 6-8 11-8" stroke="#fff" stroke-width="4" stroke-linecap="round"/><path d="M14 46h36" stroke="#c9d3e6" stroke-width="3" stroke-linecap="round"/>`,
    rain: `<path d="M16 38c-6 0-10-4-10-9s5-9 10-9c1-8 8-13 16-13s13 4 15 11c6 0 11 4 11 10s-5 10-11 10Z" fill="#b9c6dd" ${S()}/>
      ${[[18, 46], [30, 48], [42, 46], [24, 56], [38, 56]].map(([x, y]) => `<path d="M${x} ${y}l-3 6" stroke="#3a86ff" stroke-width="3.6" stroke-linecap="round"/>`).join('')}`,
    snow: `<path d="M16 36c-6 0-10-4-10-9s5-9 10-9c1-8 8-13 16-13s13 4 15 11c6 0 11 4 11 10s-5 10-11 10Z" fill="#eef3fb" ${S()}/>
      ${[[18, 47], [32, 50], [46, 47], [25, 58], [40, 58]].map(([x, y]) => `<g stroke="#6fb6ff" stroke-width="2.4" stroke-linecap="round"><path d="M${x - 4} ${y}h8M${x} ${y - 4}v8M${x - 3} ${y - 3}l6 6M${x + 3} ${y - 3}l-6 6"/></g>`).join('')}`,
  };
  A.trophy2 = A.trophy;

  // Which art stands for each kind of shop / district

  function svg(name, cls) {
    const body = A[name] || A.sparkle;
    return `<svg class="ic${cls ? ' ' + cls : ''}" viewBox="0 0 64 64" aria-hidden="true">${body}</svg>`;
  }
  const urlCache = {};
  function url(name) {
    if (!urlCache[name]) urlCache[name] = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="256" height="256">${A[name] || A.sparkle}</svg>`);
    return urlCache[name];
  }

  // ---------- Chef portraits: each chef gets a unique face from their id ----------
  const SKINS = ['#ffd9b8', '#f1c27d', '#d9a066', '#a8693f', '#7a4a2a'];
  const HAIRS = ['#2b2118', '#5a3825', '#d9a441', '#b5442e', '#8c8c8c', '#1f2a44'];
  const SCARVES = ['#ff4d5e', '#3a86ff', '#3ddc84', '#ffcf2e', '#b56cff'];
  function chefParts(id) {
    let x = (id * 2654435761) >>> 0;
    const r = (n) => { x = (x * 1103515245 + 12345) >>> 0; return (x >>> 8) % n; };
    return { skin: SKINS[r(SKINS.length)], hair: HAIRS[r(HAIRS.length)], scarf: SCARVES[r(SCARVES.length)], style: r(4), beard: r(5) === 0, lash: r(2) };
  }
  function chefBody(id) {
    const c = chefParts(id);
    const hair = [
      `<path d="M15 33C14 22 20 20 24 21L22 34Z" fill="${c.hair}" ${S(3)}/><path d="M49 33C50 22 44 20 40 21L42 34Z" fill="${c.hair}" ${S(3)}/>`,
      `<path d="M14 34C12 44 16 54 22 54L22 34ZM50 34C52 44 48 54 42 54L42 34Z" fill="${c.hair}" ${S(3)}/>`,
      `<circle cx="47" cy="40" r="6" fill="${c.hair}" ${S(3)}/>`,
      '',
    ][c.style];
    return `<path d="M10 64C10 52 20 46 32 46S54 52 54 64Z" fill="#fff" ${S()}/><path d="M24 47 32 56 40 47" fill="${c.scarf}" ${S(3)}/>
      ${hair}<circle cx="32" cy="35" r="15" fill="${c.skin}" ${S()}/>
      ${c.beard ? `<path d="M19 38C20 48 26 51 32 51S44 48 45 38C41 43 36 44 32 44S23 43 19 38Z" fill="${c.hair}" ${S(2.5)}/>` : ''}
      <ellipse cx="26" cy="35" rx="2.2" ry="2.8" fill="${OL}"/><ellipse cx="38" cy="35" rx="2.2" ry="2.8" fill="${OL}"/>
      <circle cx="26.8" cy="34" r=".9" fill="#fff"/><circle cx="38.8" cy="34" r=".9" fill="#fff"/>
      ${c.lash ? `<path d="M23 31 21 29M41 31 43 29" stroke="${OL}" stroke-width="2" stroke-linecap="round"/>` : ''}
      <circle cx="22" cy="40" r="3" fill="#ff7a8a" opacity=".5"/><circle cx="42" cy="40" r="3" fill="#ff7a8a" opacity=".5"/>
      <path d="M27 41Q32 46 37 41" fill="none" ${S(2.5)}/>
      ${blobs('<circle cx="22" cy="16" r="8"/><circle cx="32" cy="11" r="10"/><circle cx="42" cy="16" r="8"/><rect x="19" y="15" width="26" height="9" rx="2"/>', '#fff')}
      <rect x="18" y="20" width="28" height="7" rx="2.5" fill="#e9edf6" ${S(3)}/><circle cx="27" cy="9" r="3" ${SHINE}/>`;
  }
  function chef(m, cls) {
    return `<svg class="ic${cls ? ' ' + cls : ''}" viewBox="0 0 64 64" aria-hidden="true">${chefBody(m && m.id ? m.id : 7)}</svg>`;
  }

  function hydrate(root) {
    (root || document).querySelectorAll('[data-ic]').forEach(el => {
      if (el._ic === el.dataset.ic) return;
      el._ic = el.dataset.ic;
      el.innerHTML = el.dataset.ic === 'avatar' ? chef({ id: 3 }) : svg(el.dataset.ic);
    });
  }

  window.Icons = { svg, url, chef, hydrate, names: Object.keys(A) };
})();
