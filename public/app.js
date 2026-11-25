'use strict';
const $ = s => document.querySelector(s);
const RES = ['brick', 'lumber', 'wool', 'grain', 'ore'];
const ICON = { brick: '🧱', lumber: '🌲', wool: '🐑', grain: '🌽', ore: '⛰️', desert: '🌵' };
const FILL = { brick: '#c8673b', lumber: '#2f7d3a', wool: '#9bcb58', grain: '#e8c23c', ore: '#8a8e99', desert: '#e2d3a1' };
const COST = {
  road: { brick: 1, lumber: 1 }, settlement: { brick: 1, lumber: 1, wool: 1, grain: 1 },
  city: { grain: 2, ore: 3 }, dev: { wool: 1, grain: 1, ore: 1 },
};
const DEV = {
  knight: ['Knight', 'Move the robber and steal a card. 3 knights earns Largest Army.'],
  vp: ['Victory Point', 'Worth 1 point. Stays hidden and counts automatically.'],
  road: ['Road Building', 'Place 2 roads for free.'],
  yop: ['Year of Plenty', 'Take any 2 resource cards from the bank.'],
  mono: ['Monopoly', 'Name a resource. Every other player gives you all of theirs.'],
};
const U = 60;
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get: k => { try { return JSON.parse(localStorage.getItem('sic.' + k)); } catch (e) { return null; } },
  set: (k, v) => { try { localStorage.setItem('sic.' + k, JSON.stringify(v)); } catch (e) { } },
};

let S = null, GEO = null, session = store.get('session'), timer = null, busy = false, lastRoll = null, rollAnim = 0;
let ui = { modal: null, mode: null, pick: null, give: {}, want: {}, tab: 'players', disc: {}, yop: [], chat: '', overSeen: false };
const urlCode = (new URLSearchParams(location.search).get('g') || '').toUpperCase();

/* ---------------- network ---------------- */
async function api(method, path, body) {
  const r = await fetch('/api/' + path, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({ error: 'Connection problem.' }));
  if (!r.ok) throw Object.assign(new Error(j.error || 'Something went wrong.'), { status: r.status });
  return j;
}
function toast(m) {
  const d = document.createElement('div'); d.textContent = m; $('#toast').appendChild(d);
  setTimeout(() => d.remove(), 3200);
}
function setState(r) {
  if (r.geo) GEO = r.geo;
  if (S && r.version < S.version) return;
  S = r;
  if (S.turn && S.turn.rollId && S.turn.rollId !== lastRoll) { if (lastRoll !== null) rollAnim = Date.now(); lastRoll = S.turn.rollId; }
  else if (lastRoll === null) lastRoll = (S.turn && S.turn.rollId) || 0;
  if (!(S.phase === 'play' && S.actor === S.you && S.turn.phase === 'main')) ui.mode = null;
  ui.pick = null;
  render();
}
async function act(a, quiet) {
  if (busy) return; busy = true;
  try { setState(await api('POST', 'action', { code: session.code, token: session.token, action: a })); }
  catch (e) { if (!quiet) toast(e.message); }
  busy = false;
}
async function poll() {
  clearTimeout(timer);
  if (session && !document.hidden) {
    try {
      const r = await api('GET', `state?code=${session.code}&token=${session.token}&v=${S ? S.version : 0}${GEO ? '' : '&geo=1'}`);
      if (!r.same) setState(r);
    } catch (e) {
      if (e.status === 404 || e.status === 403) { toast(e.message); leave(); return; }
    }
  }
  timer = setTimeout(poll, S && S.phase === 'over' ? 6000 : S && S.phase === 'lobby' ? 1500 : S && S.players[S.actor] && S.players[S.actor].bot ? 750 : 1000);
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });
function enter(code, token) {
  session = { code, token }; store.set('session', session); store.set('seat.' + code, token); S = null; lastRoll = null;
  ui = { modal: null, mode: null, pick: null, give: {}, want: {}, tab: 'players', disc: {}, yop: [], chat: '', overSeen: false };
  history.replaceState(null, '', '?g=' + code);
  render(); poll();
}
function leave() { session = null; S = null; store.set('session', null); clearTimeout(timer); history.replaceState(null, '', location.pathname); render(); }

/* ---------------- home & lobby ---------------- */
const LOGO = `<svg class="hexlogo" viewBox="0 0 100 100"><polygon points="50,4 90,27 90,73 50,96 10,73 10,27" fill="#ffcd00" stroke="#16181c" stroke-width="6"/><text x="50" y="67" font-size="46" text-anchor="middle">🌽</text></svg>`;
function homeHTML() {
  const name = store.get('name') || '';
  return `<div class="home">
    <div class="brand">${LOGO}<h1>Settlers of <span>Iowa City</span></h1><p>Build roads, settlements and cities. First to 10 points wins.</p></div>
    <div class="card stack"><div><label for="name">Your name</label><input id="name" maxlength="16" placeholder="Enter your name" value="${esc(name)}" autocomplete="nickname"></div></div>
    ${urlCode ? '' : `<div class="card stack"><h2>Start a new game</h2><button class="primary wide" data-a="create">Create game</button><div class="hint">You'll get a code to share. Play with 1–4 people; add computer players to fill seats.</div></div><div class="or">— or —</div>`}
    <div class="card stack"><h2>Join a game</h2><div><label for="code">Game code</label><input id="code" maxlength="8" placeholder="e.g. K7M2Q" value="${esc(urlCode)}" autocapitalize="characters" autocomplete="off"></div><button class="${urlCode ? 'primary' : 'dark'} wide" data-a="join">Join game</button></div>
    ${urlCode ? `<div class="or">— or —</div><div class="card"><button class="wide" data-a="create">Create a new game instead</button></div>` : ''}
  </div>`;
}
function lobbyHTML() {
  const host = S.you === S.host, seats = [];
  S.players.forEach((p, i) => seats.push(`<div class="seat"><i class="dot" style="background:${p.color}"></i><b>${esc(p.name)}${i === S.you ? ' (you)' : ''}${i === S.host ? ' · host' : ''}</b>${host && i !== S.host ? `<button class="small ghost" data-a="send" data-j='{"type":"removeSeat","seat":${i}}'>Remove</button>` : ''}</div>`));
  for (let i = S.players.length; i < 4; i++) seats.push(`<div class="seat empty">Open seat</div>`);
  return `<div class="home">
    <div class="brand"><h1>Settlers of <span>Iowa City</span></h1></div>
    <div class="card stack"><label>Game code — share it with your players</label><div class="codebig">${S.code}</div><button class="dark wide" data-a="share">Share invite link</button></div>
    <div class="card stack"><h2>Players (${S.players.length}/4)</h2>${seats.join('')}
      ${host ? `<button class="wide" data-a="send" data-j='{"type":"addBot"}' ${S.players.length >= 4 ? 'disabled' : ''}>+ Add computer player</button>
        <button class="primary wide" data-a="send" data-j='{"type":"start"}'>Start game</button>
        <div class="hint">${S.players.length === 1 ? 'Playing alone? Add computer players, or start solo and race to 10 points.' : 'Start whenever everyone is in.'}</div>`
      : `<div class="hint">Waiting for ${esc(S.players[S.host].name)} to start the game…</div>`}
    </div>
    <div class="card"><button class="ghost wide" data-a="leave">Leave</button></div>
  </div>`;
}

/* ---------------- board ---------------- */
function boardSVG(mode) {
  const g = GEO, o = [], L = S.legal || {};
  const P = v => [g.vertices[v].x * U, g.vertices[v].y * U];
  // harbors
  for (const p of S.ports) {
    const e = g.edges[p.edge], [ax, ay] = P(e.a), [bx, by] = P(e.b), mx = (ax + bx) / 2, my = (ay + by) / 2;
    const h = g.hexes.find(h => h.corners.includes(e.a) && h.corners.includes(e.b));
    const nx = (mx - h.x * U) / (0.866 * U), ny = (my - h.y * U) / (0.866 * U), px = mx + nx * 40, py = my + ny * 40;
    o.push(`<path d="M${ax},${ay} L${px},${py} L${bx},${by}" fill="none" stroke="#f6efdc" stroke-width="4" stroke-dasharray="2 5" stroke-linecap="round"/>`);
    o.push(`<circle cx="${px}" cy="${py}" r="19" fill="#f6efdc" stroke="#16181c" stroke-width="2"/>`);
    o.push(p.type === '3:1' ? `<text x="${px}" y="${py + 5}" font-size="14" font-weight="800" text-anchor="middle">3:1</text>`
      : `<text x="${px}" y="${py - 1}" font-size="14" text-anchor="middle">${ICON[p.type]}</text><text x="${px}" y="${py + 13}" font-size="10" font-weight="800" text-anchor="middle">2:1</text>`);
  }
  // hexes
  S.hexes.forEach((h, i) => {
    const hx = g.hexes[i], cx = hx.x * U, cy = hx.y * U;
    o.push(`<polygon points="${hx.corners.map(v => P(v).join(',')).join(' ')}" fill="${FILL[h.res]}" stroke="#f1e2b4" stroke-width="5" stroke-linejoin="round"/>`);
    o.push(`<text x="${cx}" y="${cy - 24}" font-size="20" text-anchor="middle">${ICON[h.res]}</text>`);
    if (h.num) {
      const hot = h.num === 6 || h.num === 8, n = 6 - Math.abs(7 - h.num);
      o.push(`<circle cx="${cx}" cy="${cy + 8}" r="18" fill="#fbf4dd" stroke="#16181c" stroke-width="1.5"/>`);
      o.push(`<text x="${cx}" y="${cy + 12}" font-size="${hot ? 19 : 17}" font-weight="800" text-anchor="middle" fill="${hot ? '#c0392b' : '#16181c'}">${h.num}</text>`);
      for (let k = 0; k < n; k++) o.push(`<circle cx="${cx + (k - (n - 1) / 2) * 4.6}" cy="${cy + 19}" r="1.6" fill="${hot ? '#c0392b' : '#16181c'}"/>`);
    }
    if (S.robber === i) o.push(`<g transform="translate(${cx - 33},${cy + 8})"><ellipse cx="0" cy="8" rx="10" ry="13" fill="#23262b" stroke="#fff" stroke-width="2"/><circle cx="0" cy="-10" r="8" fill="#23262b" stroke="#fff" stroke-width="2"/></g>`);
  });
  // roads
  S.edges.forEach((ow, e) => {
    if (ow === null) return;
    const [ax, ay] = P(g.edges[e].a), [bx, by] = P(g.edges[e].b), t = 0.17;
    const c = `x1="${ax + (bx - ax) * t}" y1="${ay + (by - ay) * t}" x2="${bx + (ax - bx) * t}" y2="${by + (ay - by) * t}" stroke-linecap="round"`;
    o.push(`<line ${c} stroke="#16181c" stroke-width="11"/><line ${c} stroke="${S.players[ow].color}" stroke-width="7"/>`);
  });
  // buildings
  S.vertices.forEach((b, v) => {
    if (!b) return;
    const [x, y] = P(v), col = S.players[b.p].color;
    o.push(b.city
      ? `<path d="M${x - 13},${y + 10} v-15 l7,-8 l7,8 v3 h9 v12 z" fill="${col}" stroke="#16181c" stroke-width="2.2" stroke-linejoin="round"/>`
      : `<path d="M${x - 9},${y + 8} v-10 l9,-8 l9,8 v10 z" fill="${col}" stroke="#16181c" stroke-width="2.2" stroke-linejoin="round"/>`);
  });
  // tap targets
  const pk = ui.pick;
  if (mode === 'settlement' || mode === 'city') for (const v of (mode === 'city' ? L.city : L.settle) || []) {
    const [x, y] = P(v), on = pk && pk.k === 'v' && pk.id === v;
    o.push(`<circle class="spot ${on ? 'picked' : ''}" cx="${x}" cy="${y}" r="${mode === 'city' ? 15 : 10}" ${mode === 'city' && !on ? 'fill-opacity=".35"' : ''}/><circle class="hit" data-a="pick" data-k="v" data-id="${v}" cx="${x}" cy="${y}" r="20"/>`);
  }
  if (mode === 'road') for (const e of L.road || []) {
    const [ax, ay] = P(g.edges[e].a), [bx, by] = P(g.edges[e].b), t = 0.22, on = pk && pk.k === 'e' && pk.id === e;
    const c = `x1="${ax + (bx - ax) * t}" y1="${ay + (by - ay) * t}" x2="${bx + (ax - bx) * t}" y2="${by + (ay - by) * t}"`;
    o.push(`<line ${c} stroke="#16181c" stroke-width="13" stroke-linecap="round" opacity=".55"/><line class="espot ${on ? 'picked' : ''}" ${c}/><line class="hit" data-a="pick" data-k="e" data-id="${e}" ${c} style="stroke-width:26;stroke:transparent;stroke-linecap:round"/>`);
  }
  if (mode === 'robber') S.hexes.forEach((h, i) => {
    if (i === S.robber) return;
    const cx = g.hexes[i].x * U, cy = g.hexes[i].y * U, on = pk && pk.k === 'h' && pk.id === i;
    o.push(`<circle class="spot ${on ? 'picked' : ''}" cx="${cx}" cy="${cy + 8}" r="24" fill-opacity="${on ? 1 : .25}"/><circle class="hit" data-a="pick" data-k="h" data-id="${i}" cx="${cx}" cy="${cy}" r="42"/>`);
  });
  return `<svg class="board" viewBox="-338 -322 676 644" xmlns="http://www.w3.org/2000/svg">${o.join('')}</svg>`;
}

/* ---------------- game screen ---------------- */
const mine = () => S.actor === S.you;
function activeMode() {
  if (!mine()) return null;
  if (S.phase === 'setup') return S.setup.step;
  if (S.phase === 'play') {
    const p = S.turn.phase;
    if (p === 'robber') return 'robber';
    if (p === 'roadbuilding') return 'road';
    if (p === 'main') return ui.mode;
  }
  return null;
}
function statusText() {
  if (S.phase === 'over') return [`🏆 ${S.players[S.winner].name} wins!`, 'Game over'];
  const an = S.players[S.actor].name;
  if (S.phase === 'setup') {
    const round = S.setup.i < S.players.length ? 'first' : 'second';
    if (mine()) return S.setup.step === 'settlement' ? [`Place your ${round} settlement`, 'Tap a glowing corner, then confirm.'] : ['Now place a road beside it', 'Tap a glowing edge, then confirm.'];
    return [`${an} is placing a ${S.setup.step}`, 'Set-up'];
  }
  const T = S.turn;
  if (T.phase === 'discard') {
    const who = Object.keys(S.discards).map(k => S.players[k].name).join(', ');
    return S.discards[S.you] ? ['Discard half your cards', ''] : ['A seven was rolled', 'Waiting for ' + who + ' to discard.'];
  }
  if (S.trade && S.trade.from !== S.you) return [`${S.players[S.trade.from].name} has a trade offer open`, S.trade.resp[S.you] === 'yes' ? 'You accepted — waiting for their pick.' : 'You declined.'];
  if (mine()) switch (T.phase) {
    case 'roll': return ['Your turn — roll the dice', 'You may play a development card first.'];
    case 'robber': return ['Move the robber', 'Tap a hex, then confirm.'];
    case 'steal': return ['Choose who to rob', ''];
    case 'roadbuilding': return [`Place ${T.free} free road${T.free > 1 ? 's' : ''}`, 'Tap a glowing edge, then confirm.'];
    default: return ui.mode ? [`Where does your ${ui.mode} go?`, 'Tap a glowing spot, then confirm.'] : ['Your turn', 'Build, trade, or end your turn.'];
  }
  const what = { roll: 'about to roll', robber: 'moving the robber', steal: 'choosing who to rob', roadbuilding: 'placing free roads', main: 'building and trading' }[T.phase];
  return [`${an}'s turn`, `${an} is ${what}.`];
}
const can = c => RES.every(r => (S.players[S.you].res[r] || 0) >= (c[r] || 0));
const costIcons = c => RES.map(r => ICON[r].repeat(c[r] || 0)).join('');

function gameHTML() {
  const me = S.players[S.you], T = S.turn, mode = activeMode(), [msg, sub] = statusText();
  const chips = S.players.map((p, i) => `<div class="chip ${i === S.actor && S.phase !== 'over' ? 'on' : ''}" style="border-color:${p.color}">
    <div class="n"><span>${esc(p.name)}${i === S.you ? ' (you)' : ''}</span><span class="vp">★ ${p.vp}</span></div>
    <div class="st"><span title="Resource cards">🂠 ${p.cards}</span><span title="Development cards">🃏 ${p.devs}</span><span title="Knights played">⚔️ ${p.knights}</span><span title="Longest road">🛣️ ${p.road}</span>
    ${S.longestRoad === i ? '<span class="badge">Longest Road</span>' : ''}${S.largestArmy === i ? '<span class="badge">Largest Army</span>' : ''}</div></div>`).join('');
  const d = T && T.dice, rolling = Date.now() - rollAnim < 700;
  const right = ui.pick ? `<div class="confirm"><button class="primary" data-a="confirm">✓ Confirm</button><button data-a="unpick">✕</button></div>`
    : d ? `<div class="dice ${rolling ? 'roll' : ''}"><div class="die">${d[0]}</div><div class="die red">${d[1]}</div></div>` : '';
  const last = S.log.filter(l => l.chat == null).slice(-1)[0];
  const b = [], play = S.phase === 'play', myMain = play && mine() && T.phase === 'main';
  if (play && mine() && T.phase === 'roll') b.push(`<button class="primary" data-a="send" data-j='{"type":"roll"}'>🎲 Roll dice</button>`);
  if (myMain && ui.mode) b.push(`<button data-a="mode" data-m="">✕ Cancel building</button>`);
  if (myMain && !ui.mode) b.push(`<button data-a="open" data-m="build">🔨 Build</button><button data-a="open" data-m="trade">🤝 Trade</button>`);
  if (play && !ui.mode) b.push(`<button data-a="open" data-m="dev">🃏 Cards${me.devs ? ' (' + me.devs + ')' : ''}</button>`);
  if (myMain && !ui.mode) b.push(`<button class="primary" data-a="send" data-j='{"type":"endTurn"}'>End turn</button>`);
  if (S.phase === 'over') b.push(`<button class="primary" data-a="open" data-m="over">Final scores</button>`);
  return `<div class="game">
    <div class="top"><b>Settlers of Iowa City</b><span class="code">${S.code}</span><button data-a="open" data-m="log">💬 Log</button><button data-a="open" data-m="help">?</button></div>
    <div class="players">${chips}</div>
    ${me.bot && me.wasHuman ? `<div class="banner"><span>The computer is playing your seat.</span><button class="small primary" data-a="send" data-j='{"type":"unbot"}'>Take back control</button></div>` : ''}
    <div class="status ${mine() && S.phase !== 'over' ? 'mine' : ''}"><div class="msg">${esc(msg)}<small>${esc(ui.pick || mine() ? sub : (last ? last.m : sub))}</small></div>${right}</div>
    <div class="boardwrap">${boardSVG(mode)}</div>
    <div class="hand">${RES.map(r => `<div class="rc ${r} ${me.res[r] ? '' : 'zero'}">${ICON[r]} ${me.res[r]}<small>${r}</small></div>`).join('')}</div>
    <div class="actions">${b.join('')}</div>
  </div>`;
}

/* ---------------- dialogs ---------------- */
function forced() {
  if (S.phase === 'over') return ui.overSeen ? null : 'over';
  if (S.phase !== 'play') return null;
  if (S.discards[S.you]) return 'discard';
  if (S.turn.phase === 'steal' && mine()) return 'steal';
  if (S.trade) { if (S.trade.from === S.you) return 'myoffer'; if (!S.trade.resp[S.you]) return 'offer'; }
  return null;
}
const sum = o => RES.reduce((s, r) => s + (o[r] || 0), 0);
const resLine = o => RES.filter(r => o[r]).map(r => `<b>${o[r]}</b> ${ICON[r]}`).join(' &nbsp; ') || '—';
const stepper = (key, r, max, note) => `<div class="step"><span class="l">${ICON[r]} ${r} <small>${note}</small></span><button data-a="step" data-o="${key}" data-r="${r}" data-d="-1" ${ui[key][r] ? '' : 'disabled'}>−</button><span class="v">${ui[key][r] || 0}</span><button data-a="step" data-o="${key}" data-r="${r}" data-d="1" ${(ui[key][r] || 0) < max ? '' : 'disabled'}>+</button></div>`;
const head = (t, closable = true) => `<h2>${t}${closable ? '<button class="small" data-a="close">Close</button>' : ''}</h2>`;

function modalHTML() {
  const m = forced() || ui.modal;
  if (!m || !S || S.phase === 'lobby') return '';
  const me = S.players[S.you], T = S.turn, L = S.legal || {};
  if (m === 'over') {
    const rows = S.players.map((p, i) => ({ p, i })).sort((a, b) => b.p.vp - a.p.vp).map(({ p, i }) => `<tr><td><i class="dot" style="display:inline-block;background:${p.color};vertical-align:-2px"></i> ${esc(p.name)}${i === S.winner ? ' 🏆' : ''}<div class="hint">${p.vpCards ? p.vpCards + ' hidden Victory Point card' + (p.vpCards > 1 ? 's' : '') + ' · ' : ''}${p.knights} knights · road of ${p.road}</div></td><td>${p.vp}</td></tr>`).join('');
    return `<div class="sheet">${head('🏆 ' + esc(S.players[S.winner].name) + ' wins!', false)}<table class="score">${rows}</table><div class="row"><button data-a="seen">Look at the board</button><button class="primary" data-a="leave">New game</button></div></div>`;
  }
  if (m === 'discard') {
    const need = S.discards[S.you], n = sum(ui.disc);
    return `<div class="sheet">${head('Discard ' + need + ' cards', false)}<div class="hint">A seven was rolled and you hold more than 7 cards.</div>${RES.filter(r => me.res[r]).map(r => stepper('disc', r, n < need ? me.res[r] : 0, 'you have ' + me.res[r])).join('')}<div class="row"><button class="primary" data-a="discard" ${n === need ? '' : 'disabled'}>Discard ${n}/${need}</button></div></div>`;
  }
  if (m === 'steal') return `<div class="sheet">${head('Steal a card from…', false)}${T.victims.map(i => `<button class="opt" data-a="send" data-j='{"type":"steal","from":${i}}'><i class="dot" style="background:${S.players[i].color}"></i><span class="t">${esc(S.players[i].name)}<small>${S.players[i].cards} cards</small></span></button>`).join('')}</div>`;
  if (m === 'offer') {
    const tr = S.trade, ok = RES.every(r => me.res[r] >= (tr.want[r] || 0));
    return `<div class="sheet">${head('Trade offer from ' + esc(S.players[tr.from].name), false)}<div class="offer">You get<br>${resLine(tr.give)}</div><div class="offer" style="margin-top:8px">You give<br>${resLine(tr.want)}</div>${ok ? '' : '<div class="hint" style="margin-top:8px">You don\'t have those cards.</div>'}<div class="row"><button data-a="send" data-j='{"type":"tradeRespond","accept":false}'>Decline</button><button class="primary" data-a="send" data-j='{"type":"tradeRespond","accept":true}' ${ok ? '' : 'disabled'}>Accept</button></div></div>`;
  }
  if (m === 'myoffer') {
    const tr = S.trade;
    const rows = S.players.map((p, i) => i === S.you ? '' : `<div class="seat" style="margin-top:8px"><i class="dot" style="background:${p.color}"></i><b>${esc(p.name)}</b>${tr.resp[i] === 'yes' ? `<button class="small primary" data-a="send" data-j='{"type":"tradeConfirm","with":${i}}'>Trade</button>` : `<span class="hint">${tr.resp[i] === 'no' ? 'Declined' : 'Thinking…'}</span>`}</div>`).join('');
    return `<div class="sheet">${head('Your offer', false)}<div class="offer">You give ${resLine(tr.give)}<br>for ${resLine(tr.want)}</div>${rows}<div class="row"><button data-a="send" data-j='{"type":"tradeCancel"}'>Cancel offer</button></div></div>`;
  }
  if (m === 'build') {
    const item = (k, name, note, ok, a) => `<button class="opt" ${a} ${ok ? '' : 'disabled'}><span class="t">${name}<small>${note}</small></span><span class="c">${costIcons(COST[k])}</span></button>`;
    return `<div class="sheet">${head('Build')}
      ${item('road', 'Road', !me.left.road ? 'No pieces left' : !(L.road || []).length ? 'Nowhere to build' : me.left.road + ' pieces left', can(COST.road) && me.left.road && (L.road || []).length, 'data-a="mode" data-m="road"')}
      ${item('settlement', 'Settlement · 1 point', !me.left.settlement ? 'No pieces left — upgrade to a city first' : !(L.settle || []).length ? 'No open spot on your roads' : me.left.settlement + ' pieces left', can(COST.settlement) && me.left.settlement && (L.settle || []).length, 'data-a="mode" data-m="settlement"')}
      ${item('city', 'City · 2 points', !me.left.city ? 'No pieces left' : !(L.city || []).length ? 'Needs a settlement to upgrade' : 'Upgrades a settlement · ' + me.left.city + ' left', can(COST.city) && me.left.city && (L.city || []).length, 'data-a="mode" data-m="city"')}
      ${item('dev', 'Development card', S.devLeft ? S.devLeft + ' left in the deck' : 'Deck is empty', can(COST.dev) && S.devLeft, `data-a="send" data-close="1" data-j='{"type":"buyDev"}'`)}</div>`;
  }
  if (m === 'trade') {
    const solo = S.players.length < 2, tab = solo ? 'bank' : ui.tab;
    const tabs = solo ? '' : `<div class="tabs"><button class="${tab === 'players' ? 'on' : ''}" data-a="tab" data-m="players">With players</button><button class="${tab === 'bank' ? 'on' : ''}" data-a="tab" data-m="bank">Bank & harbors</button></div>`;
    if (tab === 'players') return `<div class="sheet">${head('Trade')}${tabs}<h3>You give</h3>${RES.filter(r => me.res[r]).map(r => stepper('give', r, ui.want[r] ? 0 : me.res[r], 'you have ' + me.res[r])).join('') || '<div class="hint">You have no cards.</div>'}<h3>You want</h3>${RES.map(r => stepper('want', r, ui.give[r] ? 0 : 9, '')).join('')}<div class="row"><button class="primary" data-a="offer" ${sum(ui.give) && sum(ui.want) ? '' : 'disabled'}>Offer to everyone</button></div></div>`;
    const g = ui.bGive, t = ui.bGet;
    return `<div class="sheet">${head('Trade')}${tabs}<h3>Give</h3><div class="pick">${RES.map(r => `<button class="${g === r ? 'on' : ''}" data-a="bank" data-k="bGive" data-r="${r}" ${me.res[r] >= L.ratio[r] ? '' : 'disabled'}>${ICON[r]}<small>${L.ratio[r]}:1 · have ${me.res[r]}</small></button>`).join('')}</div><h3>Get 1</h3><div class="pick">${RES.map(r => `<button class="${t === r ? 'on' : ''}" data-a="bank" data-k="bGet" data-r="${r}" ${S.bank[r] && r !== g ? '' : 'disabled'}>${ICON[r]}<small>bank ${S.bank[r]}</small></button>`).join('')}</div><div class="row"><button class="primary" data-a="bankGo" ${g && t && g !== t && me.res[g] >= L.ratio[g] ? '' : 'disabled'}>${g && t ? `Trade ${L.ratio[g]} ${ICON[g]} for 1 ${ICON[t]}` : 'Pick what to give and get'}</button></div><div class="hint" style="margin-top:8px">4:1 with the bank. A settlement on a harbor gives you 3:1, or 2:1 for that harbor's resource.</div></div>`;
  }
  if (m === 'dev') {
    const myTurn = mine() && (T.phase === 'roll' || T.phase === 'main') && !T.devPlayed, kinds = Object.keys(DEV).filter(k => me.dev.some(c => c.t === k));
    const rows = kinds.map(k => {
      const all = me.dev.filter(c => c.t === k), ready = all.some(c => c.playable);
      const a = k === 'yop' || k === 'mono' ? `data-a="open" data-m="${k}"` : `data-a="send" data-close="1" data-j='{"type":"playDev","card":"${k}"}'`;
      return `<div class="seat" style="margin-top:8px;align-items:flex-start"><b style="white-space:normal">${DEV[k][0]} × ${all.length}<div class="hint" style="font-weight:400">${DEV[k][1]}${k !== 'vp' && !ready ? ' <i>Bought this turn — playable next turn.</i>' : ''}</div></b>${k !== 'vp' ? `<button class="small primary" ${a} ${myTurn && ready ? '' : 'disabled'}>Play</button>` : ''}</div>`;
    }).join('');
    return `<div class="sheet">${head('Your development cards')}${rows || '<div class="hint">You have none yet. Buy them from the Build menu (🐑🌽⛰️).</div>'}<div class="hint" style="margin-top:10px">You can play one development card per turn, before or after rolling.${T.devPlayed && mine() ? ' You already played one this turn.' : ''}</div></div>`;
  }
  if (m === 'yop') return `<div class="sheet">${head('Year of Plenty — pick 2')}<div class="pick">${RES.map(r => `<button data-a="yop" data-r="${r}" ${S.bank[r] > ui.yop.filter(x => x === r).length ? '' : 'disabled'}>${ICON[r]}<small>${ui.yop.filter(x => x === r).length ? '× ' + ui.yop.filter(x => x === r).length : r}</small></button>`).join('')}</div><div class="row"><button data-a="yopClear">Clear</button><button class="primary" data-a="yopGo" ${ui.yop.length === 2 ? '' : 'disabled'}>Take ${ui.yop.map(r => ICON[r]).join(' ')}</button></div></div>`;
  if (m === 'mono') return `<div class="sheet">${head('Monopoly — name a resource')}<div class="pick">${RES.map(r => `<button data-a="send" data-close="1" data-j='{"type":"playDev","card":"mono","res":"${r}"}'>${ICON[r]}<small>${r}</small></button>`).join('')}</div></div>`;
  if (m === 'log') {
    const hostTools = S.you === S.host && S.phase !== 'over' ? S.players.map((p, i) => i === S.you || p.bot ? '' : `<button class="small ghost" style="margin:6px 6px 0 0" data-a="send" data-j='{"type":"botify","seat":${i}}'>Let the computer play for ${esc(p.name)}</button>`).join('') : '';
    return `<div class="sheet">${head('Game log & chat')}<div class="log" id="log">${S.log.map(l => l.chat != null ? `<div class="chat"><span style="color:${S.players[l.chat] ? '#16181c' : ''}">${esc(S.players[l.chat] ? S.players[l.chat].name : '?')}:</span> ${esc(l.m)}</div>` : `<div>${esc(l.m)}</div>`).join('')}</div><div class="row"><input id="chat" maxlength="140" placeholder="Say something…" value="${esc(ui.chat)}" style="flex:3"><button class="dark" data-a="chat">Send</button></div>${hostTools ? '<h3>Host</h3>' + hostTools : ''}<div class="row"><button class="ghost" data-a="share">Share invite link</button><button class="ghost" data-a="leave">Leave game</button></div></div>`;
  }
  if (m === 'help') return `<div class="sheet help">${head('How to play')}
    <h3>Building costs</h3>
    <div class="seat"><b>Road</b>${costIcons(COST.road)}</div><div class="seat" style="margin-top:6px"><b>Settlement · 1 point</b>${costIcons(COST.settlement)}</div><div class="seat" style="margin-top:6px"><b>City · 2 points</b>${costIcons(COST.city)}</div><div class="seat" style="margin-top:6px"><b>Development card</b>${costIcons(COST.dev)}</div>
    <h3>Your turn</h3><ul><li><b>Roll.</b> Every hex with that number pays its neighbors: 1 card per settlement, 2 per city.</li><li><b>Trade</b> with other players, the bank (4:1) or your harbors (3:1 or 2:1).</li><li><b>Build</b> roads, settlements, cities, or buy development cards.</li></ul>
    <h3>Rules to remember</h3><ul><li>Settlements must be at least two corners apart, and connect to your own road.</li><li><b>Rolling a 7:</b> anyone with more than 7 cards discards half. The roller moves the robber and steals a card. The robber's hex produces nothing.</li><li><b>Longest Road</b> (5+ in a row) and <b>Largest Army</b> (3+ knights) are worth 2 points each, and can be taken away.</li><li>Pieces: 15 roads, 5 settlements, 4 cities each.</li><li>First to <b>10 points</b> on their own turn wins.</li></ul>
    <h3>Board</h3><p>🧱 hills give brick · 🌲 forest gives lumber · 🐑 pasture gives wool · 🌽 fields give grain · ⛰️ mountains give ore · 🌵 desert gives nothing. Dots under a number show how often it rolls.</p></div>`;
  return '';
}

/* ---------------- render & input ---------------- */
function render() {
  const keep = document.activeElement && document.activeElement.id;
  const logEl = $('#log'), atBottom = !logEl || logEl.scrollTop + logEl.clientHeight >= logEl.scrollHeight - 30;
  if (!session) { if (!$('#name')) $('#app').innerHTML = homeHTML(); $('#modal').innerHTML = ''; return; }
  if (!S || !GEO && S.phase !== 'lobby') { $('#app').innerHTML = `<div class="home"><div class="brand">${LOGO}<h1>Settlers of <span>Iowa City</span></h1><p>Loading game…</p></div></div>`; return; }
  $('#app').innerHTML = S.phase === 'lobby' ? lobbyHTML() : gameHTML();
  $('#modal').innerHTML = modalHTML();
  const l = $('#log'); if (l && atBottom) l.scrollTop = l.scrollHeight;
  if (keep === 'chat' && $('#chat')) { const c = $('#chat'); c.focus(); c.setSelectionRange(c.value.length, c.value.length); }
}
const A = {
  async create() {
    const name = $('#name').value.trim(); if (!name) return toast('Enter your name first.'); store.set('name', name);
    try { const r = await api('POST', 'create', { name }); enter(r.code, r.token); } catch (e) { toast(e.message); }
  },
  async join() {
    const name = $('#name').value.trim(), code = $('#code').value.trim().toUpperCase();
    if (!name) return toast('Enter your name first.'); if (!code) return toast('Enter the game code.'); store.set('name', name);
    const old = store.get('seat.' + code);
    if (old) { try { await api('GET', `state?code=${code}&token=${old}`); return enter(code, old); } catch (e) { } }
    try { const r = await api('POST', 'join', { code, name }); store.set('seat.' + r.code, r.token); enter(r.code, r.token); } catch (e) { toast(e.message); }
  },
  leave() { if (S && S.phase !== 'lobby' && S.phase !== 'over' && !confirm('Leave this game? You can come back with the same link.')) return; leave(); },
  async share() {
    const url = location.origin + '/?g=' + S.code, text = `Join my game of Settlers of Iowa City — code ${S.code}`;
    try { if (navigator.share) await navigator.share({ title: 'Settlers of Iowa City', text, url }); else { await navigator.clipboard.writeText(url); toast('Invite link copied.'); } } catch (e) { }
  },
  send(el) { if (el.dataset.close) ui.modal = null; act(JSON.parse(el.dataset.j)); },
  open(el) { ui.modal = el.dataset.m; if (ui.modal === 'trade') { ui.give = {}; ui.want = {}; ui.bGive = ui.bGet = null; } if (ui.modal === 'yop') ui.yop = []; render(); },
  close() { ui.modal = null; render(); },
  seen() { ui.overSeen = true; ui.modal = null; render(); },
  tab(el) { ui.tab = el.dataset.m; render(); },
  mode(el) { ui.mode = el.dataset.m || null; ui.modal = null; ui.pick = null; render(); },
  pick(el) { ui.pick = { k: el.dataset.k, id: +el.dataset.id }; render(); },
  unpick() { ui.pick = null; render(); },
  confirm() {
    const p = ui.pick, mode = activeMode(); if (!p || !mode) return;
    ui.mode = null;
    act(mode === 'robber' ? { type: 'robber', hex: p.id } : mode === 'road' ? { type: 'road', e: p.id } : { type: mode, v: p.id });
  },
  step(el) { const o = ui[el.dataset.o], r = el.dataset.r; o[r] = Math.max(0, (o[r] || 0) + +el.dataset.d); render(); },
  discard() { const c = ui.disc; ui.disc = {}; act({ type: 'discard', cards: c }); },
  offer() { act({ type: 'tradeOffer', give: ui.give, want: ui.want }); ui.modal = null; },
  bank(el) { ui[el.dataset.k] = el.dataset.r; if (ui.bGive === ui.bGet) ui.bGet = null; render(); },
  bankGo() { act({ type: 'bankTrade', give: ui.bGive, get: ui.bGet }); },
  yop(el) { if (ui.yop.length < 2) ui.yop.push(el.dataset.r); render(); },
  yopClear() { ui.yop = []; render(); },
  yopGo() { ui.modal = null; act({ type: 'playDev', card: 'yop', r1: ui.yop[0], r2: ui.yop[1] }); },
  chat() { const t = ui.chat.trim(); if (!t) return; ui.chat = ''; act({ type: 'chat', text: t }); },
};
document.addEventListener('click', e => {
  const el = e.target.closest('[data-a]');
  if (el && !el.disabled && A[el.dataset.a]) A[el.dataset.a](el);
});
document.addEventListener('input', e => { if (e.target.id === 'chat') ui.chat = e.target.value; });
document.addEventListener('keydown', e => { if (e.key === 'Enter') { if (e.target.id === 'chat') A.chat(); if (e.target.id === 'code') A.join(); } });

// start: resume a saved seat if the link matches (or no link was given)
if (session && urlCode && urlCode !== session.code) { const t = store.get('seat.' + urlCode); session = t ? { code: urlCode, token: t } : null; }
if (session) { store.set('seat.' + session.code, session.token); enter(session.code, session.token); } else render();
