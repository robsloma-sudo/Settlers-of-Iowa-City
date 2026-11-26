// Settlers of Iowa City — rules engine (server-authoritative, no dependencies)

// Bump APP_VERSION (here AND in public/app.js) with every release: phones running an older copy reload themselves.
export const APP_VERSION = 20;
export const RES = ['brick', 'lumber', 'wool', 'grain', 'ore'];
// what players see: the 'grain' resource is Iowa sweet corn
// house names: brick = pink elephants, lumber = JUUL pods, wool = cat mittens, grain = corn, ore = Montenegro
export const RES_NAME = { brick: 'pink elephants', lumber: 'JUUL pods', wool: 'cat mittens', grain: 'corn', ore: 'Montenegro' };
const ONE = { brick: 'pink elephant', lumber: 'JUUL pod', wool: 'cat mitten' };
const rn = (r, n = 2) => (n === 1 && ONE[r]) || RES_NAME[r] || r;
export const COST = {
  road: { brick: 1, lumber: 1 },
  settlement: { brick: 1, lumber: 1, wool: 1, grain: 1 },
  city: { grain: 2, ore: 3 },
  dev: { wool: 1, grain: 1, ore: 1 },
};
const COLORS = ['#d8443c', '#3d8bff', '#f4f1e8', '#f08a1c'];
const BOT_NAMES = ['Dubuque', 'Clinton', 'Gilbert', 'Linn', 'Burlington', 'Dodge'];
const LIMITS = { road: 15, settlement: 5, city: 4 };
const TOKENS = [5, 2, 6, 3, 8, 10, 9, 12, 11, 4, 8, 10, 9, 4, 5, 6, 3, 11];
const DEV_NAMES = { knight: 'Knight', vp: 'Victory Point', road: 'Road Building', yop: 'Year of Plenty', mono: 'Monopoly' };
const WIN = 10;

/* ---------------- geometry (identical for every game) ---------------- */
const H = [], V = [], E = [];
const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
(function build() {
  const vkey = new Map(), ekey = new Map(), hkey = new Map();
  const coords = [];
  for (let r = -2; r <= 2; r++) for (let q = -2; q <= 2; q++) if (Math.abs(q + r) <= 2) coords.push([q, r]);
  for (const [q, r] of coords) {
    const id = H.length, x = Math.sqrt(3) * (q + r / 2), y = 1.5 * r;
    const hex = { id, q, r, x, y, corners: [], edges: [] };
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 180) * (60 * i - 30);
      const vx = x + Math.cos(a), vy = y + Math.sin(a);
      const k = Math.round(vx * 100) + ',' + Math.round(vy * 100);
      if (!vkey.has(k)) { vkey.set(k, V.length); V.push({ id: V.length, x: vx, y: vy, hexes: [], adj: [], edges: [] }); }
      const vid = vkey.get(k);
      V[vid].hexes.push(id); hex.corners.push(vid);
    }
    for (let i = 0; i < 6; i++) {
      const a = hex.corners[i], b = hex.corners[(i + 1) % 6];
      const k = Math.min(a, b) + '-' + Math.max(a, b);
      if (!ekey.has(k)) {
        ekey.set(k, E.length);
        E.push({ id: E.length, a, b, hexes: [] });
        V[a].adj.push(b); V[b].adj.push(a); V[a].edges.push(E.length - 1); V[b].edges.push(E.length - 1);
      }
      const eid = ekey.get(k);
      E[eid].hexes.push(id); hex.edges.push(eid);
    }
    hkey.set(q + ',' + r, id); H.push(hex);
  }
  H.byCoord = (q, r) => hkey.get(q + ',' + r);
})();
const COAST = E.filter(e => e.hexes.length === 1)
  .map(e => ({ id: e.id, ang: Math.atan2((V[e.a].y + V[e.b].y) / 2, (V[e.a].x + V[e.b].x) / 2) }))
  .sort((a, b) => a.ang - b.ang).map(e => e.id);
const PORT_EDGES = [0, 3, 7, 10, 13, 17, 20, 23, 27].map(i => COAST[i]);

export const GEO = {
  hexes: H.map(h => ({ x: h.x, y: h.y, corners: h.corners })),
  vertices: V.map(v => ({ x: v.x, y: v.y })),
  edges: E.map(e => ({ a: e.a, b: e.b })),
};
export const _geo = { H, V, E, PORT_EDGES };

/* ---------------- helpers ---------------- */
const rnd = n => Math.floor(Math.random() * n);
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1);[a[i], a[j]] = [a[j], a[i]]; } return a; }
function rid(n) { const c = 'abcdefghijklmnopqrstuvwxyz0123456789'; let s = ''; for (let i = 0; i < n; i++) s += c[rnd(c.length)]; return s; }
const zero = () => ({ brick: 0, lumber: 0, wool: 0, grain: 0, ore: 0 });
const total = r => RES.reduce((s, k) => s + (r[k] || 0), 0);
const has = (r, c) => RES.every(k => (r[k] || 0) >= (c[k] || 0));
function fail(m) { const e = new Error(m); e.rule = true; throw e; }
function log(g, m, priv) { g.log.push(priv ? { m, priv } : { m }); if (g.log.length > 120) g.log.splice(0, g.log.length - 120); }
const nm = (g, i) => g.players[i].name;
function resText(r) { return RES.filter(k => r[k]).map(k => r[k] + ' ' + rn(k, r[k])).join(', ') || 'nothing'; }
function cleanRes(o) {
  const r = zero();
  if (o && typeof o === 'object') for (const k of RES) { const n = Math.floor(Number(o[k]) || 0); r[k] = n > 0 && n < 100 ? n : 0; }
  return r;
}
function pay(g, i, c) { const p = g.players[i]; for (const k of RES) { p.res[k] -= c[k] || 0; g.bank[k] += c[k] || 0; } }
const idxOf = (g, pid) => g.players.findIndex(p => p.id === pid);
function count(g, i, kind) {
  if (kind === 'road') return g.edges.filter(o => o === i).length;
  return g.vertices.filter(b => b && b.p === i && !!b.city === (kind === 'city')).length;
}

/* ---------------- lobby ---------------- */
export function createGame(code, hostName) {
  const g = { code, version: 1, phase: 'lobby', players: [], log: [], created: Date.now(), updated: Date.now() };
  const p = addPlayer(g, hostName, false);
  g.host = p.id;
  return { g, token: p.token };
}
export function addPlayer(g, name, bot) {
  if (g.phase !== 'lobby') fail('That game has already started.');
  if (g.players.length >= 4) fail('That game is full (4 players).');
  name = String(name || '').replace(/[<>]/g, '').trim().slice(0, 16) || 'Player';
  if (bot) name = BOT_NAMES.find(n => !g.players.some(p => p.name === n));
  let base = name, n = 2;
  while (g.players.some(p => p.name.toLowerCase() === name.toLowerCase())) name = base + ' ' + n++;
  const p = { id: rid(8), token: rid(24), name, bot: !!bot, color: COLORS.find(c => !g.players.some(q => q.color === c)) };
  g.players.push(p);
  return p;
}

function start(g) {
  shuffle(g.players);
  const terrain = shuffle([...Array(4).fill('lumber'), ...Array(4).fill('wool'), ...Array(4).fill('grain'), ...Array(3).fill('brick'), ...Array(3).fill('ore'), 'desert']);
  // official variable set-up: number tokens laid in a spiral from a random corner
  const k = rnd(6), spiral = [];
  for (const radius of [2, 1]) {
    const ring = []; let q = DIRS[4][0] * radius, r = DIRS[4][1] * radius;
    for (let i = 0; i < 6; i++) for (let j = 0; j < radius; j++) { ring.push(H.byCoord(q, r)); q += DIRS[i][0]; r += DIRS[i][1]; }
    for (let i = 0; i < ring.length; i++) spiral.push(ring[(i + k * radius) % ring.length]);
  }
  spiral.push(H.byCoord(0, 0));
  g.hexes = H.map((h, i) => ({ res: terrain[i], num: 0 }));
  let t = 0;
  for (const id of spiral) if (g.hexes[id].res !== 'desert') g.hexes[id].num = TOKENS[t++];
  g.robber = g.hexes.findIndex(h => h.res === 'desert');
  const types = shuffle(['3:1', '3:1', '3:1', '3:1', ...RES]);
  g.ports = PORT_EDGES.map((e, i) => ({ edge: e, type: types[i] }));
  g.vertices = Array(V.length).fill(null);
  g.edges = Array(E.length).fill(null);
  g.bank = { brick: 19, lumber: 19, wool: 19, grain: 19, ore: 19 };
  g.devDeck = shuffle([...Array(14).fill('knight'), ...Array(5).fill('vp'), 'road', 'road', 'yop', 'yop', 'mono', 'mono']);
  for (const p of g.players) { p.res = zero(); p.dev = []; p.knights = 0; }
  g.longestRoad = null; g.largestArmy = null; g.trade = null; g.discards = {};
  g.phase = 'setup'; g.setup = { i: 0, step: 'settlement', last: null }; g.turn = null; g.winner = null;
  log(g, 'The game begins. ' + g.players.map(p => p.name).join(', ') + ' — place your first settlements.');
  // house rule: the champion intro plays on every screen; computer players wait for it
  g.intro = { id: (g.intro ? g.intro.id : 0) + 1 };
  g.introUntil = Date.now() + INTRO_MS;
  g.nextLove = Date.now() + INTRO_MS + 60000 + rnd(120001);
}
const setupOrder = g => { const n = g.players.length; return [...Array(n).keys(), ...[...Array(n).keys()].reverse()]; };
export function actorIdx(g) {
  if (g.phase === 'setup') return setupOrder(g)[g.setup.i];
  if (g.phase === 'play') return g.turn.idx;
  return -1;
}

/* ---------------- placement rules ---------------- */
function canSettle(g, v, i, setup) {
  if (g.vertices[v] || V[v].adj.some(a => g.vertices[a])) return false;
  return setup || V[v].edges.some(e => g.edges[e] === i);
}
function canRoad(g, e, i, fromVertex) {
  if (g.edges[e] !== null) return false;
  if (fromVertex != null) return E[e].a === fromVertex || E[e].b === fromVertex;
  for (const v of [E[e].a, E[e].b]) {
    const b = g.vertices[v];
    if (b && b.p === i) return true;
    if (!b && V[v].edges.some(x => x !== e && g.edges[x] === i)) return true;
  }
  return false;
}
function legalRoads(g, i, from) { return count(g, i, 'road') >= LIMITS.road ? [] : E.filter(e => canRoad(g, e.id, i, from)).map(e => e.id); }
function legalSettles(g, i, setup) { return count(g, i, 'settlement') >= LIMITS.settlement ? [] : V.filter(v => canSettle(g, v.id, i, setup)).map(v => v.id); }
function legalCities(g, i) { return count(g, i, 'city') >= LIMITS.city ? [] : V.filter(v => g.vertices[v.id] && g.vertices[v.id].p === i && !g.vertices[v.id].city).map(v => v.id); }

export function roadLength(g, i) {
  let best = 0; const used = new Set();
  const dfs = (v, len) => {
    if (len > best) best = len;
    const b = g.vertices[v];
    if (b && b.p !== i && len > 0) return; // an opponent's building breaks the road
    for (const e of V[v].edges) if (g.edges[e] === i && !used.has(e)) {
      used.add(e); dfs(E[e].a === v ? E[e].b : E[e].a, len + 1); used.delete(e);
    }
  };
  for (const v of V) if (v.edges.some(e => g.edges[e] === i)) dfs(v.id, 0);
  return best;
}
function updateLongestRoad(g) {
  const lens = g.players.map((_, i) => roadLength(g, i)), max = Math.max(...lens), old = g.longestRoad;
  let now = null;
  if (max >= 5) {
    if (old !== null && lens[old] === max) now = old;
    else { const c = lens.map((l, i) => l === max ? i : -1).filter(i => i >= 0); now = c.length === 1 ? c[0] : null; }
  }
  if (now !== old) {
    g.longestRoad = now;
    log(g, now === null ? 'Nobody holds Longest Road now.' : `${nm(g, now)} takes Longest Road (${max} roads) — 2 victory points.`);
  }
}
function updateLargestArmy(g, i) {
  const k = g.players[i].knights;
  if (k >= 3 && g.largestArmy !== i && (g.largestArmy === null || k > g.players[g.largestArmy].knights)) {
    g.largestArmy = i; log(g, `${nm(g, i)} takes Largest Army (${k} knights) — 2 victory points.`);
  }
}
export function vp(g, i, hidden) {
  let s = 0;
  for (const b of g.vertices) if (b && b.p === i) s += b.city ? 2 : 1;
  if (g.longestRoad === i) s += 2;
  if (g.largestArmy === i) s += 2;
  if (hidden) s += g.players[i].dev.filter(c => c.t === 'vp').length;
  return s;
}
function ratio(g, i, res) {
  let r = 4;
  for (const p of g.ports) for (const v of [E[p.edge].a, E[p.edge].b]) {
    const b = g.vertices[v];
    if (b && b.p === i) { if (p.type === res) return 2; if (p.type === '3:1') r = 3; }
  }
  return r;
}
// House rule: every new settlement plays the construction show with one of three photos
function newHome(g, i) {
  const last = g.home ? g.home.pic : -1;
  let pic = rnd(3); if (pic === last) pic = (pic + 1 + rnd(2)) % 3;   // avoid the same photo twice in a row
  g.home = { id: (g.home ? g.home.id : 0) + 1, player: i, pic };
}
// House rule: a road built and a development card bought in the same turn
// sets off the "Kennedy Special" celebration on every screen (once per turn).
function kennedy(g, i) {
  const T = g.turn;
  if (!T.builtRoad || !T.boughtDev || T.kennedy) return;
  T.kennedy = true;
  g.special = { id: (g.special ? g.special.id : 0) + 1, player: i };
  log(g, `🎉 Kennedy Special! ${nm(g, i)} built a road and bought a development card in the same turn.`);
}
// House rule: when a new road ends at a corner where another player's road
// already touches, every screen gets the "It's On" blast.
function itsOn(g, i, e) {
  for (const v of [E[e].a, E[e].b]) {
    const other = V[v].edges.map(x => g.edges[x]).find(o => o !== null && o !== i);
    if (other !== undefined) {
      g.boom = { id: (g.boom ? g.boom.id : 0) + 1, player: i, other };
      log(g, `💥 It's on! ${nm(g, i)}'s road just ran into ${nm(g, other)}'s.`);
      return;
    }
  }
}
// House rule: 30-second turn clock. It starts once the roll (and any robber business) is done.
export const TURN_SECONDS = 30;
export const INTRO_MS = 11500;
export const LOVE_PHOTOS = 11;
export const DEAL_PHOTOS = 7, DEAL_MS = 3600;
// House rule: every 1–3 minutes a romantic slideshow of 4 random photos plays on every screen (10–15 s).
// The turn clock pauses and computer players wait while it plays.
export function checkRomance(g, now = Date.now()) {
  if (g.phase !== 'setup' && g.phase !== 'play') return false;
  if (!g.nextLove) { g.nextLove = now + 60000 + rnd(120001); return true; }
  if (now < g.nextLove || (g.introUntil && now < g.introUntil)) return false;
  const dur = 10000 + rnd(5001);
  const pics = shuffle([...Array(LOVE_PHOTOS).keys()]).slice(0, 4);
  g.love = { id: (g.love ? g.love.id : 0) + 1, pics, dur };
  g.pauseUntil = now + dur;
  if (g.turn && g.turn.deadline) g.turn.deadline += dur;
  g.nextLove = now + dur + 60000 + rnd(120001);
  return true;
}
function startClock(g) { if (!g.turn.deadline) g.turn.deadline = Date.now() + TURN_SECONDS * 1000; }
const resume = g => { g.turn.phase = g.turn.rolled ? 'main' : 'roll'; if (g.turn.rolled) startClock(g); };
function nextTurn(g) {
  const T = g.turn;
  g.trade = null;
  const idx = (T.idx + 1) % g.players.length;
  g.turn = { idx, num: T.num + 1, phase: 'roll', rolled: false, devPlayed: false, dice: T.dice, rollId: T.rollId, free: 0 };
}
// called by the server on every poll: passes the turn on when the clock has run out
export function checkTimeout(g, now = Date.now()) {
  if (g.phase !== 'play' || !g.turn.deadline || now < g.turn.deadline) return false;
  const T = g.turn, i = T.idx, p = g.players[i];
  if (T.phase === 'robber') { g.robber = botRobberHex(g, i); const vs = robberVictims(g, g.robber, i); if (vs.length) stealFrom(g, i, vs[rnd(vs.length)]); }
  else if (T.phase === 'steal') stealFrom(g, i, T.victims[rnd(T.victims.length)]);
  if (g.turn.phase === 'discard') return false;
  log(g, `⏰ Time's up for ${p.name}! The turn passes to ${nm(g, (i + 1) % g.players.length)}.`);
  nextTurn(g);
  return true;
}
function checkWin(g) {
  if (g.phase !== 'play') return;
  const i = g.turn.idx;
  if (vp(g, i, true) >= WIN) {
    g.phase = 'over'; g.winner = i; g.trade = null;
    log(g, `🏆 ${nm(g, i)} wins with ${vp(g, i, true)} victory points!`);
  }
}

/* ---------------- dice, production, robber ---------------- */
function produce(g, n) {
  const gains = g.players.map(zero);
  g.hexes.forEach((h, id) => {
    if (h.num !== n || id === g.robber) return;
    for (const v of H[id].corners) { const b = g.vertices[v]; if (b) gains[b.p][h.res] += b.city ? 2 : 1; }
  });
  for (const r of RES) {
    const takers = gains.map((x, i) => x[r] > 0 ? i : -1).filter(i => i >= 0);
    const want = takers.reduce((s, i) => s + gains[i][r], 0);
    if (want > g.bank[r]) {
      if (takers.length === 1) gains[takers[0]][r] = g.bank[r];
      else { for (const i of takers) gains[i][r] = 0; log(g, `The bank is short on ${rn(r)} — nobody receives any.`); }
    }
  }
  let any = false;
  gains.forEach((x, i) => {
    if (!total(x)) return; any = true;
    for (const r of RES) { g.players[i].res[r] += x[r]; g.bank[r] -= x[r]; }
    log(g, `${nm(g, i)} receives ${resText(x)}.`);
  });
  if (!any) log(g, 'No one produces anything.');
}
function stealFrom(g, i, victim) {
  const hand = []; const vr = g.players[victim].res;
  for (const r of RES) for (let k = 0; k < vr[r]; k++) hand.push(r);
  if (hand.length) {
    const r = hand[rnd(hand.length)]; vr[r]--; g.players[i].res[r]++;
    log(g, `${nm(g, i)} steals a card from ${nm(g, victim)}.`,
      { [i]: `You stole 1 ${rn(r, 1)} from ${nm(g, victim)}.`, [victim]: `${nm(g, i)} stole 1 ${rn(r, 1)} from you.` });
  }
  g.turn.victims = null; resume(g);
}
function robberVictims(g, hex, i) {
  const s = new Set();
  for (const v of H[hex].corners) { const b = g.vertices[v]; if (b && b.p !== i && total(g.players[b.p].res) > 0) s.add(b.p); }
  return [...s];
}

/* ---------------- actions ---------------- */
export function applyAction(g, pid, a) {
  const i = idxOf(g, pid);
  if (i < 0) fail('You are not in this game.');
  if (!a || typeof a.type !== 'string') fail('Bad action.');
  const me = g.players[i];

  if (a.type === 'chat') {
    const t = String(a.text || '').replace(/[<>]/g, '').trim().slice(0, 140);
    if (t) g.log.push({ m: t, chat: i });
    return;
  }
  if (a.type === 'botify') { // host hands an absent player's seat to the computer
    if (pid !== g.host) fail('Only the host can do that.');
    const t = g.players[a.seat];
    if (!t || t.bot || t.id === g.host || g.phase === 'lobby') fail('Cannot do that.');
    t.bot = true; t.wasHuman = true; log(g, `${t.name} is now played by the computer.`); return;
  }
  // host menu: start over with the same players, or stop the game now
  if (a.type === 'restart') {
    if (pid !== g.host) fail('Only the host can restart the game.');
    if (g.phase === 'lobby') fail('The game has not started yet.');
    for (const p of g.players) { if (p.wasHuman) { p.bot = false; delete p.wasHuman; } delete p.res; delete p.dev; delete p.knights; }
    g.phase = 'lobby'; g.turn = null; g.setup = null; g.trade = null; g.winner = null; g.ended = false; g.discards = {};
    log(g, `🔁 ${me.name} restarted the game. Same players — waiting for the host to start.`);
    return;
  }
  if (a.type === 'endGame') {
    if (pid !== g.host) fail('Only the host can end the game.');
    if (g.phase !== 'setup' && g.phase !== 'play') fail('There is no game running.');
    g.phase = 'over'; g.ended = true; g.trade = null;
    const scores = g.players.map((_, k) => vp(g, k, true)), best = Math.max(...scores);
    const leaders = scores.map((v, k) => v === best ? k : -1).filter(k => k >= 0);
    g.winner = leaders.length === 1 ? leaders[0] : null;
    log(g, `🏁 ${me.name} ended the game. ${g.winner === null ? 'It finishes in a tie.' : nm(g, g.winner) + ' was in the lead with ' + best + ' points.'}`);
    return;
  }
  if (a.type === 'unbot') {
    if (!me.wasHuman || !me.bot) fail('Nothing to take back.');
    me.bot = false; log(g, `${me.name} is back in control.`); return;
  }

  if (g.phase === 'lobby') {
    if (pid !== g.host) fail('Only the host can do that.');
    if (a.type === 'addBot') { addPlayer(g, '', true); return; }
    if (a.type === 'removeSeat') {
      const t = g.players[a.seat];
      if (!t || t.id === g.host) fail('Cannot remove that seat.');
      g.players.splice(a.seat, 1); return;
    }
    if (a.type === 'start') { start(g); return; }
    fail('The game has not started yet.');
  }
  if (g.phase === 'over') fail('The game is over.');

  if (g.phase === 'setup') {
    if (actorIdx(g) !== i) fail('It is not your turn to place.');
    const s = g.setup;
    if (a.type === 'settlement' && s.step === 'settlement') {
      if (!canSettle(g, a.v, i, true)) fail('You cannot build there.');
      g.vertices[a.v] = { p: i }; s.last = a.v; s.step = 'road'; newHome(g, i);
      // house rule: BOTH starting settlements pay one card for every land they touch
      const got = zero();
      for (const h of V[a.v].hexes) { const r = g.hexes[h].res; if (r !== 'desert' && g.bank[r] > 0) { got[r]++; me.res[r]++; g.bank[r]--; } }
      log(g, `${me.name} places a settlement and collects ${resText(got)}.`);
      return;
    }
    if (a.type === 'road' && s.step === 'road') {
      if (!canRoad(g, a.e, i, s.last)) fail('That road must touch the settlement you just placed.');
      g.edges[a.e] = i; itsOn(g, i, a.e); s.i++; s.step = 'settlement'; s.last = null;
      if (s.i >= g.players.length * 2) {
        g.phase = 'play'; g.setup = null;
        g.turn = { idx: 0, num: 1, phase: 'roll', rolled: false, devPlayed: false, dice: null, free: 0 };
        log(g, `Set-up is done. ${nm(g, 0)} takes the first turn.`);
      }
      return;
    }
    fail('Place a ' + s.step + ' now.');
  }

  /* ---- play phase ---- */
  const T = g.turn;
  if (a.type === 'discard') {
    const need = g.discards[i];
    if (!need) fail('You do not need to discard.');
    const c = cleanRes(a.cards);
    if (total(c) !== need || !has(me.res, c)) fail(`Choose exactly ${need} cards to discard.`);
    pay(g, i, c); delete g.discards[i];
    log(g, `${me.name} discards ${need} cards.`);
    if (!Object.keys(g.discards).length && T.phase === 'discard') T.phase = 'robber';
    return;
  }
  if (a.type === 'tradeRespond') {
    const tr = g.trade;
    if (!tr || tr.from === i) fail('No offer to answer.');
    if (a.accept && !has(me.res, tr.want)) fail('You do not have those cards.');
    tr.resp[i] = a.accept ? 'yes' : 'no'; return;
  }
  if (T.idx !== i) fail('It is not your turn.');

  switch (a.type) {
    case 'roll': {
      if (T.phase !== 'roll') fail('You cannot roll now.');
      const d = [1 + rnd(6), 1 + rnd(6)], n = d[0] + d[1];
      T.dice = d; T.rolled = true; g.rolls = (g.rolls || 0) + 1; T.rollId = g.rolls;
      log(g, `${me.name} rolls ${n} (${d[0]} + ${d[1]}).`);
      if (n === 7) {
        g.discards = {};
        // house rule: 7 or more cards → give back half, rounded up (7→4, 8→4, 9→5)
        g.players.forEach((p, k) => { const t = total(p.res); if (t >= 7) g.discards[k] = Math.ceil(t / 2); });
        T.phase = Object.keys(g.discards).length ? 'discard' : 'robber';
        log(g, 'A seven! The robber strikes.');
      } else { produce(g, n); T.phase = 'main'; startClock(g); }
      break;
    }
    case 'robber': {
      if (T.phase !== 'robber') fail('You cannot move the robber now.');
      if (!(a.hex >= 0 && a.hex < H.length) || a.hex === g.robber) fail('Move the robber to a different hex.');
      g.robber = a.hex;
      log(g, `${me.name} moves the robber.`);
      const vs = robberVictims(g, a.hex, i);
      if (vs.length === 0) resume(g);
      else if (vs.length === 1) stealFrom(g, i, vs[0]);
      else { T.phase = 'steal'; T.victims = vs; }
      break;
    }
    case 'steal': {
      if (T.phase !== 'steal' || !T.victims.includes(a.from)) fail('Choose who to steal from.');
      stealFrom(g, i, a.from); break;
    }
    case 'road': {
      const free = T.phase === 'roadbuilding';
      if (!free && T.phase !== 'main') fail('You cannot build now.');
      if (count(g, i, 'road') >= LIMITS.road) fail('You are out of road pieces.');
      if (!canRoad(g, a.e, i)) fail('You cannot build a road there.');
      if (!free) { if (!has(me.res, COST.road)) fail('You cannot afford a road.'); pay(g, i, COST.road); }
      g.edges[a.e] = i; log(g, `${me.name} builds a road.`);
      itsOn(g, i, a.e); T.builtRoad = true; kennedy(g, i);
      updateLongestRoad(g);
      if (free) { T.free--; if (T.free <= 0 || !legalRoads(g, i).length) { T.free = 0; resume(g); } }
      break;
    }
    case 'settlement': {
      if (T.phase !== 'main') fail('You cannot build now.');
      if (count(g, i, 'settlement') >= LIMITS.settlement) fail('You are out of settlement pieces — upgrade one to a city first.');
      if (!canSettle(g, a.v, i, false)) fail('You cannot build a settlement there.');
      if (!has(me.res, COST.settlement)) fail('You cannot afford a settlement.');
      pay(g, i, COST.settlement); g.vertices[a.v] = { p: i }; newHome(g, i);
      log(g, `${me.name} builds a settlement.`); updateLongestRoad(g); break;
    }
    case 'city': {
      if (T.phase !== 'main') fail('You cannot build now.');
      const b = g.vertices[a.v];
      if (!b || b.p !== i || b.city) fail('Cities replace one of your own settlements.');
      if (count(g, i, 'city') >= LIMITS.city) fail('You are out of city pieces.');
      if (!has(me.res, COST.city)) fail('You cannot afford a city.');
      pay(g, i, COST.city); b.city = true; log(g, `${me.name} upgrades to a city.`); break;
    }
    case 'buyDev': {
      if (T.phase !== 'main') fail('You cannot buy that now.');
      if (!g.devDeck.length) fail('The development deck is empty.');
      if (!has(me.res, COST.dev)) fail('You cannot afford a development card.');
      pay(g, i, COST.dev);
      const t = g.devDeck.pop(); me.dev.push({ t, n: T.num });
      T.boughtDev = true;
      g.peek = { id: (g.peek ? g.peek.id : 0) + 1, player: i };   // house rule: the cat peeks in
      log(g, `${me.name} buys a development card.`, { [i]: `You bought a development card: ${DEV_NAMES[t]}.` });
      kennedy(g, i);
      break;
    }
    case 'playDev': {
      if (T.phase !== 'main' && T.phase !== 'roll') fail('You cannot play a card now.');
      if (T.devPlayed) fail('Only one development card per turn.');
      if (a.card === 'vp') fail('Victory Point cards count automatically.');
      const k = me.dev.findIndex(c => c.t === a.card && c.n < T.num);
      if (k < 0) fail(me.dev.some(c => c.t === a.card) ? 'You cannot play a card on the turn you bought it.' : 'You do not have that card.');
      if (a.card === 'yop') {
        const r1 = a.r1, r2 = a.r2;
        if (!RES.includes(r1) || !RES.includes(r2)) fail('Pick two resources.');
        const need = zero(); need[r1]++; need[r2]++;
        if (!has(g.bank, need)) fail('The bank does not have those cards.');
        for (const r of [r1, r2]) { me.res[r]++; g.bank[r]--; }
        log(g, `${me.name} plays Year of Plenty and takes ${resText(need)}.`);
      } else if (a.card === 'mono') {
        if (!RES.includes(a.res)) fail('Pick a resource.');
        let n = 0;
        g.players.forEach((p, k2) => { if (k2 !== i) { n += p.res[a.res]; me.res[a.res] += p.res[a.res]; p.res[a.res] = 0; } });
        log(g, `${me.name} plays Monopoly on ${rn(a.res)} and collects ${n}.`);
      } else if (a.card === 'road') {
        T.free = Math.min(2, LIMITS.road - count(g, i, 'road'));
        log(g, `${me.name} plays Road Building.`);
        if (T.free > 0 && legalRoads(g, i).length) T.phase = 'roadbuilding'; else T.free = 0;
      } else if (a.card === 'knight') {
        me.knights++; log(g, `${me.name} plays a Knight.`);
        updateLargestArmy(g, i); T.phase = 'robber';
      } else fail('Unknown card.');
      me.dev.splice(k, 1); T.devPlayed = true;
      break;
    }
    case 'bankTrade': {
      if (T.phase !== 'main') fail('Trade after you roll.');
      if (!RES.includes(a.give) || !RES.includes(a.get) || a.give === a.get) fail('Pick two different resources.');
      const r = ratio(g, i, a.give);
      if (me.res[a.give] < r) fail(`You need ${r} ${rn(a.give)} for that trade.`);
      if (g.bank[a.get] < 1) fail('The bank is out of ' + rn(a.get) + '.');
      me.res[a.give] -= r; g.bank[a.give] += r; me.res[a.get]++; g.bank[a.get]--;
      log(g, `${me.name} trades ${r} ${rn(a.give)} to the ${r === 4 ? 'bank' : 'harbor'} for 1 ${rn(a.get, 1)}.`);
      break;
    }
    case 'tradeOffer': {
      if (T.phase !== 'main') fail('Trade after you roll.');
      if (g.players.length < 2) fail('There is nobody to trade with.');
      const give = cleanRes(a.give), want = cleanRes(a.want);
      if (!total(give) || !total(want)) fail('Both sides must give at least one card.');
      if (RES.some(r => give[r] && want[r])) fail('You cannot trade a resource for the same resource.');
      if (!has(me.res, give)) fail('You do not have those cards.');
      g.trade = { id: rid(6), from: i, give, want, resp: {} };
      log(g, `${me.name} offers ${resText(give)} for ${resText(want)}.`);
      break;
    }
    case 'tradeCancel': { g.trade = null; break; }
    case 'tradeConfirm': {
      const tr = g.trade;
      if (!tr || tr.resp[a.with] !== 'yes') fail('That player has not accepted.');
      const o = g.players[a.with];
      if (!has(me.res, tr.give) || !has(o.res, tr.want)) { g.trade = null; fail('Someone no longer has the cards. Offer cancelled.'); }
      for (const r of RES) { me.res[r] += tr.want[r] - tr.give[r]; o.res[r] += tr.give[r] - tr.want[r]; }
      log(g, `${me.name} trades ${resText(tr.give)} to ${o.name} for ${resText(tr.want)}.`);
      g.trade = null;
      // house rule: every confirmed player trade sets off the "deal" burst (one of 7 photos + a team phrase)
      { const last = g.deal ? g.deal.pic : -1; let pic = rnd(DEAL_PHOTOS); if (pic === last) pic = (pic + 1) % DEAL_PHOTOS;
        g.deal = { id: (g.deal ? g.deal.id : 0) + 1, pic, line: rnd(1000), a: i, b: a.with };
        if (T.deadline) T.deadline += DEAL_MS; }
      break;
    }
    case 'endTurn': {
      if (T.phase !== 'main') fail(T.phase === 'roll' ? 'Roll the dice first.' : 'Finish your current step first.');
      nextTurn(g);
      break;
    }
    default: fail('Unknown action.');
  }
  checkWin(g);
}

/* ---------------- what each player is allowed to see ---------------- */
export function view(g, pid) {
  const me = idxOf(g, pid);
  const started = g.phase !== 'lobby';
  const out = {
    code: g.code, version: g.version, app: APP_VERSION, now: Date.now(), phase: g.phase, you: me, host: g.players.findIndex(p => p.id === g.host),
    players: g.players.map((p, i) => {
      const o = { name: p.name, color: p.color, bot: p.bot, wasHuman: !!p.wasHuman };
      if (started) {
        Object.assign(o, {
          cards: total(p.res), devs: p.dev.length, knights: p.knights,
          vp: vp(g, i, i === me || g.phase === 'over'), road: roadLength(g, i),
          left: { road: LIMITS.road - count(g, i, 'road'), settlement: LIMITS.settlement - count(g, i, 'settlement'), city: LIMITS.city - count(g, i, 'city') },
        });
        if (i === me) { o.res = p.res; o.dev = p.dev.map(c => ({ t: c.t, playable: c.t !== 'vp' && g.turn && c.n < g.turn.num })); }
        if (g.phase === 'over') o.vpCards = p.dev.filter(c => c.t === 'vp').length;
      }
      return o;
    }),
    log: g.log.slice(-60).map(l => l.chat != null ? { m: l.m, chat: l.chat } : { m: (l.priv && l.priv[me]) || l.m }),
  };
  if (!started) return out;
  Object.assign(out, {
    hexes: g.hexes, robber: g.robber, ports: g.ports, vertices: g.vertices, edges: g.edges,
    bank: g.bank, devLeft: g.devDeck.length, turn: g.turn, setup: g.setup, actor: actorIdx(g),
    discards: g.discards, trade: g.trade, special: g.special || null, boom: g.boom || null, home: g.home || null, peek: g.peek || null, intro: g.intro || null, love: g.love || null, deal: g.deal || null, longestRoad: g.longestRoad, largestArmy: g.largestArmy, winner: g.winner, ended: !!g.ended,
  });
  const L = {};
  if (me >= 0 && actorIdx(g) === me) {
    if (g.phase === 'setup') {
      if (g.setup.step === 'settlement') L.settle = legalSettles(g, me, true); else L.road = legalRoads(g, me, g.setup.last);
    } else if (g.phase === 'play') {
      L.settle = legalSettles(g, me, false); L.road = legalRoads(g, me); L.city = legalCities(g, me);
    }
  }
  if (me >= 0 && g.phase === 'play') { L.ratio = {}; for (const r of RES) L.ratio[r] = ratio(g, me, r); }
  out.legal = L;
  return out;
}

/* ---------------- computer players ---------------- */
const pips = n => n ? 6 - Math.abs(7 - n) : 0;
function spotValue(g, v) {
  let s = 0; const kinds = new Set();
  for (const h of V[v].hexes) { const x = g.hexes[h]; s += pips(x.num); if (x.res !== 'desert') kinds.add(x.res); }
  s += kinds.size * 0.6;
  if (g.ports.some(p => E[p.edge].a === v || E[p.edge].b === v)) s += 1;
  return s + Math.random() * 0.5;
}
const best = (arr, f) => arr.reduce((b, x) => { const s = f(x); return !b || s > b.s ? { x, s } : b; }, null)?.x;
function botGoal(g, i) {
  if (legalCities(g, i).length) return 'city';
  if (legalSettles(g, i, false).length) return 'settlement';
  if (legalRoads(g, i).length) return 'road';
  return 'dev';
}
function botRoadScore(g, i, e) {
  let s = Math.random();
  for (const v of [E[e].a, E[e].b]) {
    if (g.vertices[v]) continue;
    if (!V[v].adj.some(a => g.vertices[a])) s = Math.max(s, 3 + spotValue(g, v));
    else for (const w of V[v].adj) if (!g.vertices[w] && !V[w].adj.some(a => g.vertices[a])) s = Math.max(s, 1 + spotValue(g, w) * 0.4);
  }
  return s;
}
function botRobberHex(g, i) {
  return best(H.map(h => h.id).filter(h => h !== g.robber), h => {
    let s = Math.random();
    for (const v of H[h].corners) {
      const b = g.vertices[v]; if (!b) continue;
      if (b.p === i) s -= 20; else s += (b.city ? 2 : 1) * pips(g.hexes[h].num) + vp(g, b.p, false);
    }
    return s;
  });
}

export function botPending(g) {
  if (g.phase === 'lobby' || g.phase === 'over') return false;
  if (g.phase === 'play') {
    if (Object.keys(g.discards).some(k => g.players[k].bot)) return true;
    if (g.trade && g.players.some((p, k) => p.bot && k !== g.trade.from && !g.trade.resp[k])) return true;
    if (g.turn.phase === 'discard') return false;
    if (g.trade && !g.players[g.trade.from].bot) return false;
  }
  return g.players[actorIdx(g)].bot;
}

// performs exactly one computer move
export function botStep(g) {
  const act = (k, a) => applyAction(g, g.players[k].id, a);
  if (g.phase === 'setup') {
    const i = actorIdx(g);
    if (g.setup.step === 'settlement') return act(i, { type: 'settlement', v: best(legalSettles(g, i, true), v => spotValue(g, v)) });
    return act(i, { type: 'road', e: best(legalRoads(g, i, g.setup.last), e => botRoadScore(g, i, e)) });
  }
  // discards
  for (const k of Object.keys(g.discards)) if (g.players[k].bot) {
    const p = g.players[k], c = zero(), left = { ...p.res };
    for (let n = 0; n < g.discards[k]; n++) { const r = best(RES, x => left[x] + Math.random()); c[r]++; left[r]--; }
    return act(+k, { type: 'discard', cards: c });
  }
  // answer a trade offer
  if (g.trade) {
    const tr = g.trade;
    for (let k = 0; k < g.players.length; k++) {
      const p = g.players[k];
      if (!p.bot || k === tr.from || tr.resp[k]) continue;
      const ok = has(p.res, tr.want) && total(tr.give) >= total(tr.want) && vp(g, tr.from, false) < 8 &&
        RES.every(r => !tr.want[r] || p.res[r] - tr.want[r] >= 1) && Math.random() < 0.8;
      return act(k, { type: 'tradeRespond', accept: ok });
    }
    if (g.players[tr.from].bot) return act(tr.from, { type: 'tradeCancel' });
    return;
  }
  const i = g.turn.idx, p = g.players[i], T = g.turn;
  const playable = t => !T.devPlayed && p.dev.some(c => c.t === t && c.n < T.num);
  if (T.phase === 'roll') {
    const blocked = H[g.robber].corners.some(v => g.vertices[v] && g.vertices[v].p === i);
    if (playable('knight') && (blocked || Math.random() < 0.3)) return act(i, { type: 'playDev', card: 'knight' });
    return act(i, { type: 'roll' });
  }
  if (T.phase === 'robber') return act(i, { type: 'robber', hex: botRobberHex(g, i) });
  if (T.phase === 'steal') return act(i, { type: 'steal', from: best(T.victims, k => vp(g, k, false) + Math.random()) });
  if (T.phase === 'roadbuilding') return act(i, { type: 'road', e: best(legalRoads(g, i), e => botRoadScore(g, i, e)) });
  if (T.phase !== 'main') return;

  const goal = botGoal(g, i), need = COST[goal];
  const lacking = RES.filter(r => p.res[r] < (need[r] || 0));
  if (playable('knight')) return act(i, { type: 'playDev', card: 'knight' });
  if (playable('yop') && lacking.length) {
    const r1 = lacking[0], r2 = lacking[1] || lacking[0];
    const ok = r => g.bank[r] > 1;
    if (ok(r1) && ok(r2)) return act(i, { type: 'playDev', card: 'yop', r1, r2 });
  }
  if (playable('mono') && lacking.length) return act(i, { type: 'playDev', card: 'mono', res: lacking[0] });
  if (playable('road') && legalRoads(g, i).length) return act(i, { type: 'playDev', card: 'road' });

  const cities = legalCities(g, i), spots = legalSettles(g, i, false), roads = legalRoads(g, i);
  if (cities.length && has(p.res, COST.city)) return act(i, { type: 'city', v: best(cities, v => spotValue(g, v)) });
  if (spots.length && has(p.res, COST.settlement)) return act(i, { type: 'settlement', v: best(spots, v => spotValue(g, v)) });
  if (roads.length && has(p.res, COST.road) && (!spots.length || (p.res.brick > 1 && p.res.lumber > 1)))
    return act(i, { type: 'road', e: best(roads, e => botRoadScore(g, i, e)) });
  if (g.devDeck.length && has(p.res, COST.dev) && (goal !== 'city' || p.res.ore > 3 || total(p.res) > 7))
    return act(i, { type: 'buyDev' });
  // harbor / bank trade toward the current goal
  if (lacking.length) {
    const get = lacking.find(r => g.bank[r] > 0);
    const give = RES.find(r => p.res[r] - (need[r] || 0) >= ratio(g, i, r));
    if (get && give) return act(i, { type: 'bankTrade', give, get });
  }
  return act(i, { type: 'endTurn' });
}
