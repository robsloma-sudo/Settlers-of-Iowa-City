import { createGame, addPlayer, applyAction, botStep, botPending, view, vp, RES, _geo, GEO } from '../shared/engine.js';
import assert from 'node:assert';

assert.equal(GEO.hexes.length, 19); assert.equal(GEO.vertices.length, 54); assert.equal(GEO.edges.length, 72);
const pv = new Set(); for (const e of _geo.PORT_EDGES) { pv.add(_geo.E[e].a); pv.add(_geo.E[e].b); }
assert.equal(pv.size, 18, 'ports must not share corners');

function check(g) {
  for (const r of RES) {
    const s = g.bank[r] + g.players.reduce((a, p) => a + p.res[r], 0);
    assert.equal(s, 19, 'conservation ' + r);
    assert(g.bank[r] >= 0); for (const p of g.players) assert(p.res[r] >= 0);
  }
  const devs = g.devDeck.length + g.players.reduce((a, p) => a + p.dev.length + p.knights, 0);
  assert(devs <= 25);
  // distance rule
  g.vertices.forEach((b, v) => { if (b) for (const a of _geo.V[v].adj) assert(!g.vertices[a], 'distance rule'); });
  g.players.forEach((p, i) => {
    assert(g.edges.filter(o => o === i).length <= 15);
    assert(g.vertices.filter(b => b && b.p === i && !b.city).length <= 5);
    assert(g.vertices.filter(b => b && b.p === i && b.city).length <= 4);
  });
}
let turns = 0, wins = 0, maxSteps = 0, stats = { lr: 0, la: 0 };
const N = +process.argv[2] || 300;
for (let n = 0; n < N; n++) {
  const { g } = createGame('T' + n, 'Host');
  const np = 1 + (n % 4);
  for (let k = 1; k < np; k++) addPlayer(g, '', true);
  applyAction(g, g.host, { type: 'start' });
  g.players.forEach(p => p.bot = true);
  // six/eight never adjacent with the spiral layout
  g.hexes.forEach((h, id) => { if (h.num === 6 || h.num === 8) for (const o of _geo.H) if (o.id !== id && Math.hypot(o.x - _geo.H[id].x, o.y - _geo.H[id].y) < 1.8) assert(![6, 8].includes(g.hexes[o.id].num), '6/8 adjacent'); });
  let steps = 0;
  while (g.phase !== 'over' && steps < 20000) {
    assert(botPending(g), 'stalled in phase ' + g.phase + ' ' + JSON.stringify(g.turn));
    botStep(g); steps++;
    if (steps % 7 === 0) { check(g); view(g, g.players[0].id); }
  }
  check(g);
  if (g.phase === 'over') { wins++; turns += g.turn.num; assert(vp(g, g.winner, true) >= 10); }
  if (g.longestRoad !== null) stats.lr++; if (g.largestArmy !== null) stats.la++;
  maxSteps = Math.max(maxSteps, steps);
}
console.log({ games: N, finished: wins, avgTurns: Math.round(turns / wins), maxSteps, stats });
