// Round 2: Direction A (map-first sheet) in light, plus a dark mode in the style of C.
const LIB = 'C:/Users/Armin/AppData/Local/Temp/claude/C--Users-Armin-Documents-workspace-depanini-app/14bc474a-c6ac-42a5-b555-75b86cd86f22/scratchpad/design/lib.cjs';
const { icon, map, statusBar, homeIndicator, page } = require(LIB);

const FONTS = 'family=Inter:wght@400;500;600;700;800;900';

// Light = round-1 A. Dark = C's dark surfaces and map, with A's layout.
const LIGHT = {
  name: 'light', bg: '#EEF0F3', surface: '#FFFFFF', surface2: '#F4F5F7', line: '#ECEEF1', track: '#E4E7EC',
  ink: '#0B0F19', muted: '#6B7280', grab: '#D5D9DF', shadow: 'rgba(16,24,40,.14)',
  ok: '#12B76A', okBg: '#ECFDF3', okFg: '#067647', warn: '#B54708', danger: '#D92D20',
  banner: '#0B0F19', bannerFg: '#FFFFFF', bannerBorder: 'transparent', plate: '#0B0F19',
  customer: { brand: '#1463D9', onBrand: '#FFFFFF', tint: '#E8F0FC' },
  driver: { brand: '#F5A300', onBrand: '#0B0F19', tint: '#FFF4D6' },
  map: (brand, ink) => ({
    land: '#EEF0F3', minor: '#FFFFFF', block: '#ECEEF1', block2: '#E6E9ED', major: '#FFFFFF', majorCasing: '#DADFE5',
    highway: '#FFF4D6', water: '#D4E6F7', park: '#DDF0DA', label: '#9AA3AE', route: ink, routeCasing: '#FFFFFF',
    pickup: brand, dropoff: ink, truckBg: ink, truckFg: '#fff', pulse: brand, dot: brand, approach: brand,
  }),
};
const DARK = {
  name: 'dark', bg: '#0B0D10', surface: '#16191E', surface2: '#1F232A', line: '#2A2F37', track: '#2A2F37',
  ink: '#F5F6F7', muted: '#8B93A0', grab: '#3A404A', shadow: 'rgba(0,0,0,.55)',
  ok: '#22C55E', okBg: 'rgba(34,197,94,.14)', okFg: '#4ADE80', warn: '#FDB022', danger: '#F97066',
  banner: '#1F232A', bannerFg: '#F5F6F7', bannerBorder: '#2A2F37', plate: '#F5F6F7',
  customer: { brand: '#4C8DFF', onBrand: '#FFFFFF', tint: 'rgba(76,141,255,.16)' },
  driver: { brand: '#FFB000', onBrand: '#0A0A0A', tint: 'rgba(255,176,0,.16)' },
  map: (brand) => ({
    minor: '#1C2027', block: '#13161B', block2: '#101317', major: '#323944', majorCasing: '#0B0D10', highway: '#4A3C1A',
    water: '#0C1E30', park: '#11241A', label: '#4D5663', route: brand, routeCasing: '#0B0D10', pickup: brand, dropoff: '#FFFFFF',
    truckBg: brand, truckFg: '#0A0A0A', truckRing: '#0B0D10', pulse: brand, dot: brand, approach: brand,
    dotTagBg: brand, dotTagFg: '#0A0A0A',
  }),
};

function build(T, app) {
  const B = T[app];
  const BRAND = B.brand, INK = T.ink, MUTED = T.muted, LINE = T.line;
  const M = T.map(BRAND, INK);
  const css = `
body{font-family:Inter,system-ui,sans-serif;color:${INK};background:${T.bg}}
.fab{position:absolute;width:48px;height:48px;border-radius:24px;background:${T.surface};display:flex;align-items:center;justify-content:center;box-shadow:0 2px 10px ${T.shadow};z-index:20;${T.name === 'dark' ? `border:1px solid ${LINE};` : ''}}
.sheet{position:absolute;left:0;right:0;bottom:0;background:${T.surface};border-radius:28px 28px 0 0;box-shadow:0 -6px 30px ${T.shadow};padding:10px 20px 34px;z-index:30;${T.name === 'dark' ? `border-top:1px solid ${LINE};` : ''}}
.grab{width:40px;height:5px;border-radius:3px;background:${T.grab};margin:0 auto 16px}
.h1{font-size:24px;font-weight:700;letter-spacing:-.4px}
.h2{font-size:17px;font-weight:600;letter-spacing:-.2px}
.sub{font-size:14px;color:${MUTED}}
.num{font-variant-numeric:tabular-nums;font-weight:800;letter-spacing:-1px}
.cta{height:56px;border-radius:16px;background:${BRAND};color:${B.onBrand};font-size:17px;font-weight:700;display:flex;align-items:center;justify-content:center;gap:8px}
.cta.big{height:64px;font-size:19px}
.ghost{height:48px;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:600;color:${MUTED}}
.outline{border:1px solid ${LINE};border-radius:14px}
.field{height:56px;border-radius:14px;background:${T.surface2};display:flex;align-items:center;gap:12px;padding:0 16px;font-size:16px}
.chip{height:36px;border-radius:18px;border:1px solid ${LINE};padding:0 14px;display:inline-flex;align-items:center;gap:6px;font-size:14px;font-weight:500;white-space:nowrap}
.chip.on{background:${B.tint};border-color:${BRAND};color:${INK};font-weight:700}
.hr{height:1px;background:${LINE};margin:14px 0}
.av{width:48px;height:48px;border-radius:24px;display:flex;align-items:center;justify-content:center;font-weight:700;color:#fff;font-size:16px;flex:none}
.pill{position:absolute;z-index:20;background:${T.surface};border-radius:22px;height:44px;padding:0 16px;display:flex;align-items:center;gap:8px;box-shadow:0 2px 10px ${T.shadow};font-weight:600;font-size:15px;${T.name === 'dark' ? `border:1px solid ${LINE};` : ''}}
.dotA{width:10px;height:10px;border-radius:5px;flex:none}
.circleBtn{width:56px;height:56px;border-radius:28px;background:${T.surface2};display:flex;align-items:center;justify-content:center;flex:none}
`;
  const shell = (title, body) => page(title, FONTS, css, statusBar(INK) + body + homeIndicator(INK));
  const stops = (a, b) => `
  <div class="row" style="gap:14px;align-items:stretch">
    <div class="col" style="align-items:center;padding:6px 0">
      <span class="dotA" style="background:${BRAND}"></span>
      <span style="flex:1;width:2px;background:${LINE};margin:4px 0"></span>
      <span class="dotA" style="background:${INK};border-radius:2px"></span>
    </div>
    <div class="col grow" style="gap:14px">
      <div><div class="sub" style="font-size:12px">Pickup</div><div style="font-size:15px;font-weight:600">${a}</div></div>
      <div><div class="sub" style="font-size:12px">Drop-off</div><div style="font-size:15px;font-weight:600">${b}</div></div>
    </div>
  </div>`;
  const stageBar = (labels, done, partial) => `
    <div class="row" style="gap:6px">
      ${labels.map((s, i) => `<div style="flex:1"><div style="height:5px;border-radius:3px;background:${i < done ? BRAND : i === done && partial ? `linear-gradient(90deg,${BRAND} 55%,${T.track} 55%)` : T.track}"></div><div style="font-size:11px;margin-top:6px;color:${i <= done ? INK : MUTED};font-weight:${i === done ? 700 : 500}">${s}</div></div>`).join('')}
    </div>`;

  const S = {};
  if (app === 'customer') {
    S['1-home'] = shell('home', `
  ${map(M, { vb: '0 60 390 844', labels: true, dots: [[60, 250], [250, 230], [200, 420]] })}
  <div class="fab" style="top:58px;left:16px">${icon('menu', 22, INK)}</div>
  <div class="fab" style="top:440px;right:16px">${icon('locate', 22, INK)}</div>
  <div style="position:absolute;left:130px;top:330px;z-index:10;transform:translate(-50%,-100%)">
    <div style="background:${T.name === 'dark' ? T.surface2 : INK};color:${T.name === 'dark' ? INK : '#fff'};font-size:13px;font-weight:600;padding:8px 12px;border-radius:12px;white-space:nowrap;margin-bottom:6px;${T.name === 'dark' ? `border:1px solid ${LINE}` : ''}">Pickup here</div>
    <svg width="34" height="44" viewBox="-17 -40 34 44" style="display:block;margin:0 auto"><path d="M0 0 C-3 -10 -14 -16 -14 -26 a14 14 0 0 1 28 0 C14 -16 3 -10 0 0z" fill="${BRAND}" stroke="#fff" stroke-width="2.5"/><circle cy="-26" r="5" fill="#fff"/></svg>
  </div>
  <div class="sheet">
    <div class="grab"></div>
    <div class="h1">Where's your vehicle?</div>
    <div class="sub" style="margin-top:4px">3 tow trucks within 5 km · nearest 6 min</div>
    <div class="field" style="margin-top:18px">${icon('pin', 20, BRAND)}<span class="grow" style="font-weight:600">Avenue Habib Bourguiba 42</span><span style="color:${BRAND};font-size:14px;font-weight:600">Edit</span></div>
    <div class="row" style="gap:8px;margin-top:12px">
      <span class="chip">${icon('home', 16, INK)}Home · La Marsa</span>
      <span class="chip">${icon('wrench', 16, INK)}Garage · Lac 2</span>
    </div>
    <div class="cta" style="margin-top:22px">Request a tow</div>
  </div>`);

    S['2-fare'] = shell('fare', `
  ${map(M, { vb: '-28 -45 487 1054', route: true, pickup: true, dropoff: true })}
  <div class="fab" style="top:58px;left:16px">${icon('back', 22, INK)}</div>
  <div class="pill" style="top:60px;left:76px">${icon('clock', 18, INK)}18.4 km · ~32 min</div>
  <div class="sheet">
    <div class="grab"></div>
    ${stops('Av. Habib Bourguiba 42, Tunis', 'Garage El Amen, La Marsa')}
    <div class="hr"></div>
    <div class="row" style="justify-content:space-between"><div class="h2">Your offer</div><span class="sub">Suggested <b style="color:${INK}">85 TND</b></span></div>
    <div class="row" style="justify-content:space-between;margin-top:12px">
      <div class="circleBtn">${icon('minus', 24, INK, 2.4)}</div>
      <div style="text-align:center"><span class="num" style="font-size:48px;letter-spacing:-1.5px">85</span><span style="font-size:20px;font-weight:700;margin-left:6px">TND</span></div>
      <div class="circleBtn">${icon('plus', 24, INK, 2.4)}</div>
    </div>
    <div style="position:relative;height:6px;border-radius:3px;background:${T.track};margin:16px 4px 8px">
      <div style="position:absolute;left:0;width:12%;height:6px;border-radius:3px;background:${BRAND}"></div>
      <div style="position:absolute;left:12%;top:-7px;width:20px;height:20px;border-radius:10px;background:${T.surface};border:2px solid ${BRAND};transform:translateX(-50%)"></div>
    </div>
    <div class="row sub" style="justify-content:space-between;font-size:12px"><span>65 TND</span><span>Drivers accept or counter</span><span>240 TND</span></div>
    <div class="row" style="gap:8px;margin-top:16px">
      <span class="chip">${icon('car', 16, INK)}Car · Breakdown</span><span class="chip">${icon('cash', 16, INK)}Cash</span>
    </div>
    <div class="cta" style="margin-top:18px">Send request · 85 TND</div>
  </div>`);

    const offer = (initials, color, name, rating, trips, truck, eta, price, tag, first) => `
  <div style="padding:14px 0;${first ? '' : `border-top:1px solid ${LINE}`}">
    <div class="row" style="gap:12px">
      <div class="av" style="background:${color}">${initials}</div>
      <div class="grow">
        <div class="row" style="gap:6px"><span style="font-weight:600;font-size:16px">${name}</span>${tag ? `<span style="font-size:11px;font-weight:700;color:${T.okFg};background:${T.okBg};padding:3px 7px;border-radius:6px">${tag}</span>` : ''}</div>
        <div class="row sub" style="gap:4px;margin-top:2px">${icon('star', 14, INK)}<span style="color:${INK};font-weight:600">${rating}</span> (${trips}) · ${truck}</div>
      </div>
      <div style="text-align:right"><div class="num" style="font-size:20px;letter-spacing:-.4px">${price} TND</div><div class="sub">${eta} away</div></div>
    </div>
    <div class="row" style="gap:10px;margin-top:12px">
      <div class="ghost outline" style="flex:1">Decline</div>
      <div class="cta" style="flex:2;height:48px;border-radius:14px;font-size:16px">Accept</div>
    </div>
  </div>`;
    S['3-offers'] = shell('offers', `
  ${map(M, { vb: '-20 150 390 844', pulse: true, pickup: true, truck: [100, 300], dots: [[260, 300], [40, 330]] })}
  <div class="fab" style="top:58px;left:16px">${icon('back', 22, INK)}</div>
  <div class="pill" style="top:60px;right:16px"><span class="dotA" style="background:${T.ok}"></span>Live · 14:12 left</div>
  <div class="sheet" style="padding-bottom:28px">
    <div class="grab"></div>
    <div class="row" style="justify-content:space-between"><div class="h1">3 offers</div><span class="sub">Your fare <b style="color:${INK}">85 TND</b></span></div>
    <div class="sub" style="margin-top:2px">Pick the driver you want. Others are declined.</div>
    ${offer('SB', '#344054', 'Sami B.', '4.8', 37, 'Flatbed', '6 min', 85, 'Your fare', true)}
    ${offer('KT', '#7A5AF8', 'Karim T.', '4.9', 112, 'Flatbed', '4 min', 95)}
    <div style="padding-top:14px;border-top:1px solid ${LINE}" class="row">
      <div class="av" style="background:#0E9384;width:40px;height:40px">NH</div>
      <div class="grow" style="margin-left:12px"><div style="font-weight:600">Nizar H.</div><div class="sub"><span style="color:${T.warn};font-weight:600">New</span> · Wheel-lift · 11 min</div></div>
      <div class="num" style="font-size:18px;letter-spacing:-.4px">80 TND</div>
    </div>
    <div class="ghost" style="margin-top:6px;color:${T.danger}">Cancel request</div>
  </div>`);

    S['4-live-trip'] = shell('live trip', `
  ${map(M, { vb: '0 0 390 844', route: true, approach: true, pickup: true, dropoff: true, truck: [78, 262] })}
  <div class="fab" style="top:58px;left:16px">${icon('back', 22, INK)}</div>
  <div class="pill" style="top:60px;left:76px">${icon('share', 18, INK)}Share trip</div>
  <div class="sheet">
    <div class="grab"></div>
    <div class="row" style="justify-content:space-between;align-items:flex-end">
      <div><div class="h1">Sami is on the way</div><div class="sub" style="margin-top:2px">Arrives at 10:04 · 1.8 km away</div></div>
      <div style="text-align:right"><span class="num" style="font-size:38px">6</span><span style="font-size:15px;font-weight:600"> min</span></div>
    </div>
    <div style="margin-top:16px">${stageBar(['Accepted', 'On the way', 'Arrived', 'Towing'], 1, true)}</div>
    <div class="hr" style="margin:18px 0"></div>
    <div class="row" style="gap:12px">
      <div class="av" style="background:#344054;width:56px;height:56px;font-size:18px">SB</div>
      <div class="grow">
        <div style="font-weight:600;font-size:17px">Sami B.</div>
        <div class="row sub" style="gap:4px">${icon('star', 14, INK)}<b style="color:${INK}">4.8</b> (37) · Flatbed</div>
        <div style="display:inline-block;margin-top:6px;font-size:13px;font-weight:700;letter-spacing:.5px;border:1.5px solid ${T.plate};border-radius:6px;padding:2px 8px">123 TU 4567</div>
      </div>
      <div class="circleBtn" style="width:48px;height:48px">${icon('msg', 20, INK)}</div>
      <div class="circleBtn" style="width:48px;height:48px;background:${BRAND}">${icon('phone', 20, B.onBrand)}</div>
    </div>
    <div class="hr"></div>
    <div class="row" style="justify-content:space-between"><span class="sub">Fare · cash to driver</span><b style="font-size:17px">85 TND</b></div>
  </div>`);
  } else {
    const req = (dist, from, to, price, kind, left, first) => `
  <div class="row" style="gap:14px;padding:14px 0;${first ? '' : `border-top:1px solid ${LINE}`}">
    <div class="col" style="width:56px;align-items:center;flex:none"><div class="num" style="font-size:20px;letter-spacing:-.4px">${dist}</div><div class="sub" style="font-size:12px">km away</div></div>
    <div class="grow">
      <div style="font-weight:600;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${from} → ${to}</div>
      <div class="sub" style="margin-top:2px;white-space:nowrap">${kind} · ${left}</div>
    </div>
    <div class="num" style="font-size:20px;letter-spacing:-.4px">${price}<span style="font-size:12px;font-weight:600"> TND</span></div>
    ${icon('chev', 18, MUTED)}
  </div>`;
    S['1-home'] = shell('driver home', `
  ${map(M, { vb: '0 60 390 844', dots: [[130, 392, '85'], [250, 240, '60'], [70, 250, '120']], truck: [180, 330] })}
  <div class="fab" style="top:58px;left:16px">${icon('menu', 22, INK)}</div>
  <div class="pill" style="top:60px;left:50%;transform:translateX(-50%);padding:0 6px 0 16px;gap:12px">
    <span>Online</span>
    <span style="width:52px;height:32px;border-radius:16px;background:${T.ok};position:relative"><span style="position:absolute;right:3px;top:3px;width:26px;height:26px;border-radius:13px;background:#fff"></span></span>
  </div>
  <div class="fab" style="top:58px;right:16px">${icon('wallet', 22, INK)}</div>
  <div class="sheet">
    <div class="grab"></div>
    <div class="row" style="justify-content:space-between"><div class="h1">3 requests nearby</div><span class="sub">Today <b style="color:${INK}">240 TND</b></span></div>
    ${req('2.1', 'Bourguiba', 'La Marsa', 85, 'Car · Breakdown', '13:20', true)}
    ${req('3.4', 'Lac 2', 'Ariana', 60, 'Car · Accident', '9:05')}
    ${req('5.0', 'El Menzah 6', 'Ben Arous', 120, 'SUV · No start', '14:41')}
  </div>`);

    S['2-request'] = shell('driver request', `
  ${map(M, { vb: '-28 -45 487 1054', route: true, pickup: true, dropoff: true, truck: [60, 470] })}
  <div class="fab" style="top:58px;left:16px">${icon('back', 22, INK)}</div>
  <div class="pill" style="top:60px;right:16px">${icon('clock', 18, INK)}13:20 left</div>
  <div class="sheet">
    <div class="grab"></div>
    <div class="row" style="justify-content:space-between;align-items:flex-end">
      <div><div class="h1">Car · Breakdown</div><div class="sub" style="margin-top:2px">2.1 km to pickup · 18.4 km tow</div></div>
      <div style="text-align:right"><span class="num" style="font-size:38px">85</span><span style="font-size:15px;font-weight:600"> TND</span></div>
    </div>
    <div class="hr"></div>
    ${stops('Av. Habib Bourguiba 42, Tunis', 'Garage El Amen, La Marsa')}
    <div class="hr"></div>
    <div class="sub" style="font-size:13px;font-weight:600;margin-bottom:10px">Or counter-offer</div>
    <div class="row" style="gap:8px">
      <span class="chip">90</span><span class="chip on">95</span><span class="chip">100</span><span class="chip">110</span><span class="chip">${icon('plus', 14, INK)}Other</span>
    </div>
    <div class="row" style="gap:10px;margin-top:18px">
      <div class="ghost outline" style="flex:1;height:64px;font-size:16px;color:${INK}">Offer 95</div>
      <div class="cta big" style="flex:1.6">Accept 85 TND</div>
    </div>
  </div>`);

    S['3-job'] = shell('driver job', `
  ${map(M, { vb: '-45 -115 520 1125', route: true, approach: true, pickup: true, dropoff: true, truck: [78, 262] })}
  <div style="position:absolute;top:56px;left:16px;right:16px;z-index:20;background:${T.banner};color:${T.bannerFg};border:1px solid ${T.bannerBorder};border-radius:18px;padding:14px 16px;display:flex;gap:14px;align-items:center;box-shadow:0 6px 20px rgba(0,0,0,.3)">
    <div style="width:44px;height:44px;border-radius:12px;background:rgba(255,255,255,.1);display:flex;align-items:center;justify-content:center">${icon('nav', 22, BRAND)}</div>
    <div class="grow"><div class="num" style="font-size:22px;letter-spacing:-.4px">1.2 km · 4 min</div><div style="font-size:14px;opacity:.7">to pickup · Av. Habib Bourguiba 42</div></div>
  </div>
  <div class="sheet">
    <div class="grab"></div>
    ${stageBar(['Accepted', 'On the way', 'Arrived', 'Towing', 'Done'], 1, false)}
    <div class="hr" style="margin:16px 0"></div>
    <div class="row" style="gap:12px">
      <div class="av" style="background:${T.surface2};color:${INK}">AK</div>
      <div class="grow"><div style="font-weight:600;font-size:17px">Ayoub K.</div><div class="sub">Peugeot 208 · Breakdown</div></div>
      <div class="circleBtn" style="width:48px;height:48px;background:${B.tint}">${icon('phone', 20, INK)}</div>
    </div>
    <div class="hr"></div>
    ${stops('Av. Habib Bourguiba 42, Tunis', 'Garage El Amen, La Marsa')}
    <div class="row" style="justify-content:space-between;margin-top:14px"><span class="sub">Collect in cash</span><b class="num" style="font-size:22px;letter-spacing:-.4px">85 TND</b></div>
    <div class="cta big" style="margin-top:16px;font-weight:800">I've arrived</div>
  </div>`);
  }
  return S;
}

module.exports = { build, LIGHT, DARK };
