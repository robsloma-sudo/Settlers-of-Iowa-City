"""Builds the hand-made board textures in public/art/ (the backup art).

Every tile is built as a height map plus a colour map, then lit from the top-left
with real cast shadows, so bricks, logs, sheep, wheat and rock read as 3-D.
Run:  python3 tools/make_art.py
"""
import os
import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter

N = 768            # working size (downsampled to OUT for smooth edges)
OUT = 512
DST = os.path.join(os.path.dirname(__file__), '..', 'public', 'art')
os.makedirs(DST, exist_ok=True)
yy, xx = np.mgrid[0:N, 0:N].astype(np.float32)


def rng(seed):
    return np.random.default_rng(seed)


def fbm(r, base, octaves=5, aniso=(1, 1)):
    out = np.zeros((N, N), np.float32)
    amp = 1.0
    for i in range(octaves):
        s = base / (2 ** i)
        g = gaussian_filter(r.standard_normal((N, N)).astype(np.float32), (s * aniso[0], s * aniso[1]), mode='wrap')
        g /= g.std() + 1e-9
        out += amp * g
        amp *= 0.55
    return out / 1.8


def col(h):
    h = h.lstrip('#')
    return np.array([int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)], np.float32)


def mix(a, b, t):
    t = np.clip(t, 0, 1)[..., None]
    return a * (1 - t) + b * t


def render(name, albedo, height, shadow_len=26, slope=0.9, ambient=0.5, strength=1.0, wrap=True, quality=84):
    gx = (np.roll(height, -1, 1) - np.roll(height, 1, 1)) * 0.5
    gy = (np.roll(height, -1, 0) - np.roll(height, 1, 0)) * 0.5
    nx, ny, nz = -gx * strength, -gy * strength, np.ones_like(height)
    nl = np.sqrt(nx * nx + ny * ny + nz * nz)
    L = np.array([-0.55, -0.6, 0.58]); L /= np.linalg.norm(L)
    lam = np.clip((nx * L[0] + ny * L[1] + nz * L[2]) / nl, 0, 1)
    sh = np.zeros_like(height)
    for k in range(1, shadow_len):
        sh = np.maximum(sh, np.roll(height, (k, k), (0, 1)) - k * slope - height)
    shadow = np.clip(sh / 6, 0, 1)
    shadow = gaussian_filter(shadow, 1.5, mode='wrap')
    light = ambient + (1 - ambient) * 1.35 * lam
    light *= 1 - 0.55 * shadow
    img = np.clip(albedo * light[..., None], 0, 1)
    # gentle contrast / warmth grade
    img = np.clip((img - 0.5) * 1.08 + 0.5, 0, 1)
    im = Image.fromarray((img * 255).astype(np.uint8)).resize((OUT, OUT), Image.LANCZOS)
    im.save(os.path.join(DST, name + '.jpg'), quality=quality, optimize=True, progressive=True)
    print('saved', name)


def far_from_center(r, n, min_r=0.30, max_r=0.47, min_gap=0.12, pts=None):
    """random points in the ring around the number token"""
    pts = list(pts or [])
    out = []
    tries = 0
    while len(out) < n and tries < 5000:
        tries += 1
        a = r.uniform(0, 2 * np.pi)
        d = r.uniform(min_r, max_r)
        p = (0.5 + d * np.cos(a), 0.5 + d * np.sin(a))
        if all(np.hypot(p[0] - q[0], p[1] - q[1]) > min_gap for q in pts + out):
            out.append(p)
    return [(x * N, y * N) for x, y in out]


# ------------------------------------------------------------------ pasture
def pasture():
    r = rng(11)
    h = fbm(r, 40, 4) * 2.0 + fbm(r, 1.2, 2) * 0.9
    tone = fbm(r, 60, 3)
    alb = mix(col('4f8a2c'), col('86b843'), tone * 0.35 + 0.5)
    alb = mix(alb, col('3c6e22'), np.clip(fbm(r, 3, 2) * 0.4, 0, 1) * 0.6)
    # wildflowers
    for _ in range(260):
        x, y = r.integers(0, N, 2)
        c = col(['f5f1e2', 'f2d64b', 'd9d0f5'][r.integers(0, 3)])
        m = (xx - x) ** 2 + (yy - y) ** 2 < r.uniform(1.5, 3.5) ** 2
        alb[m] = c; h[m] += 0.6
    # sheep: woolly bodies as fields of bumps, dark heads
    for (cx, cy) in far_from_center(r, 4, 0.30, 0.40, 0.26):
        ang = r.uniform(0, 2 * np.pi)
        ca, sa = np.cos(ang), np.sin(ang)
        u = (xx - cx) * ca + (yy - cy) * sa
        v = -(xx - cx) * sa + (yy - cy) * ca
        a, b = 62, 42
        body = (u / a) ** 2 + (v / b) ** 2
        inside = body < 1
        dome = np.sqrt(np.clip(1 - body, 0, 1)) * 26
        wool = np.zeros_like(h)
        for _ in range(240):
            bu, bv = r.uniform(-a, a), r.uniform(-b, b)
            if (bu / a) ** 2 + (bv / b) ** 2 > 0.95:
                continue
            rr = r.uniform(6, 11)
            wool += np.exp(-((u - bu) ** 2 + (v - bv) ** 2) / (2 * rr * rr)) * 3.2
        h = np.where(inside, np.maximum(h, dome + np.clip(wool, 0, 6)), h)
        alb[inside] = mix(col('f4f1e6'), col('ddd5c2'), np.clip(fbm(r, 2, 1)[inside] * 0.3 + 0.3, 0, 1))
        hb = ((u - a - 14) / 21) ** 2 + (v / 15) ** 2
        head = hb < 1
        h = np.where(head, np.maximum(h, np.sqrt(np.clip(1 - hb, 0, 1)) * 18), h)
        alb[head] = col('2c2622')
        for s in (-1, 1):
            eb = ((u - a - 2) / 11) ** 2 + ((v - s * 17) / 6) ** 2
            ear = eb < 1
            h = np.where(ear, np.maximum(h, 12), h); alb[ear] = col('3a322c')
    render('wool', alb, h, shadow_len=34, slope=0.75)


# ------------------------------------------------------------------ grain -> sweet corn field
def _leaf(h, alb, r, x, y, ang, L, W, base, colr, bend):
    pad = int(L + W + 4)
    y0, y1, x0, x1 = max(0, int(y) - pad), min(N, int(y) + pad), max(0, int(x) - pad), min(N, int(x) + pad)
    if y0 >= y1 or x0 >= x1:
        return
    X, Y = xx[y0:y1, x0:x1] - x, yy[y0:y1, x0:x1] - y
    u = X * np.cos(ang) + Y * np.sin(ang)
    v = -X * np.sin(ang) + Y * np.cos(ang) - bend * (u / L) ** 2 * L
    t = u / L
    w = W * np.clip(np.sin(np.pi * np.clip(t, 0, 1)) ** 0.55, 0, 1) * (1 - 0.35 * t)
    m = (t > 0) & (t < 1) & (np.abs(v) < w)
    hh = base + 10 * np.sin(np.pi * np.clip(t, 0, 1) * 0.6) - 26 * np.clip(t, 0, 1) ** 1.6 + (1 - np.abs(v) / (w + 1e-6)) * 2.2
    up = m & (hh > h[y0:y1, x0:x1])
    rib = np.abs(v) < np.maximum(w * 0.14, 0.7)
    c = np.where(rib[..., None], np.minimum(colr * 1.35, 1), colr * (0.85 + 0.25 * (1 - np.abs(v) / (w + 1e-6)))[..., None])
    h[y0:y1, x0:x1] = np.where(up, hh, h[y0:y1, x0:x1])
    alb[y0:y1, x0:x1] = np.where(up[..., None], c, alb[y0:y1, x0:x1])


def _ear(h, alb, r, x, y, ang, z):
    L, W = 46, 15
    pad = 66
    y0, y1, x0, x1 = max(0, int(y) - pad), min(N, int(y) + pad), max(0, int(x) - pad), min(N, int(x) + pad)
    X, Y = xx[y0:y1, x0:x1] - x, yy[y0:y1, x0:x1] - y
    u = X * np.cos(ang) + Y * np.sin(ang)
    v = -X * np.sin(ang) + Y * np.cos(ang)
    # husk leaves peeled back from the stem end
    for k, sp in enumerate((-0.55, 0.0, 0.5)):
        _leaf(h, alb, r, x - np.cos(ang) * L * 0.9, y - np.sin(ang) * L * 0.9, ang + np.pi + sp, 42, 11, z + 2,
              col(['7da343', '9bbd55', '6e9a3a'][k]), r.uniform(-0.15, 0.15))
    W_u = W * np.sqrt(np.clip(1 - (u / L) ** 2, 0, 1)) * (1 - 0.18 * (u / L))
    m = np.abs(v) < W_u
    cyl = np.sqrt(np.clip(1 - (v / (W_u + 1e-6)) ** 2, 0, 1)) * W
    kern = (np.sin(u * 1.9) * np.sin(v * 2.4 + 0.6)) ** 2
    hh = z + cyl + kern * 1.6
    up = m & (hh > h[y0:y1, x0:x1])
    c = mix(col('e0a925'), col('fbe27a'), kern * 0.9 + 0.1)
    h[y0:y1, x0:x1] = np.where(up, hh, h[y0:y1, x0:x1])
    alb[y0:y1, x0:x1] = np.where(up[..., None], c, alb[y0:y1, x0:x1])


def grain():
    r = rng(23)
    h = fbm(r, 30, 3) * 2 + fbm(r, 2, 2) * 0.6
    alb = mix(col('4a3522'), col('6b5034'), fbm(r, 8, 3) * 0.3 + 0.5)   # dark Iowa soil between rows
    ang = np.deg2rad(28)
    greens = ['9bb43e', 'a9bd48', '8aa538', 'b8c454', '7f9b33', 'c2c25a']
    plants = []
    row_gap, step = 78, 52
    for ri in range(-12, 13):
        for k in range(-12, 13):
            px = N / 2 + ri * row_gap * -np.sin(ang) + k * step * np.cos(ang) + r.normal(0, 4)
            py = N / 2 + ri * row_gap * np.cos(ang) + k * step * np.sin(ang) + r.normal(0, 4)
            if -40 < px < N + 40 and -40 < py < N + 40:
                plants.append((px, py))
    r.shuffle(plants)
    piles = [(0.27 * N, 0.3 * N), (0.72 * N, 0.74 * N)]
    for (px, py) in plants:
        if any(np.hypot(px - a, py - b) < 80 for a, b in piles):
            continue
        base = 34 + r.uniform(-4, 6)
        for j in range(r.integers(7, 11)):
            a2 = r.uniform(0, 2 * np.pi)
            _leaf(h, alb, r, px, py, a2, r.uniform(46, 74), r.uniform(5.5, 8.5), base - j * 0.6,
                  col(greens[r.integers(0, len(greens))]), r.uniform(-0.25, 0.25))
        # golden tassel at the top of the stalk
        for j in range(10):
            a2 = r.uniform(0, 2 * np.pi)
            _leaf(h, alb, r, px, py, a2, r.uniform(14, 24), 2.6, base + 12, col(['e7bd4f', 'd49a2e', 'f3d77c'][j % 3]), 0)
    # two little piles of freshly picked, half-shucked sweet corn
    for (cx, cy) in piles:
        clearing = np.hypot(xx - cx, yy - cy) < 76 + fbm(r, 4, 2) * 4
        alb[clearing] = mix(col('6b5034'), col('8a6a44'), 0.5)
        for k in range(7):
            _ear(h, alb, r, cx + r.normal(0, 17), cy + r.normal(0, 17), r.uniform(0, 2 * np.pi), 4 + k * 3)
    render('grain', alb, h, shadow_len=30, slope=0.9, ambient=0.5, strength=0.75)


# ------------------------------------------------------------------ brick (hills + brickyard)
def brick():
    r = rng(33)
    ground = fbm(r, 70, 4) * 7 + fbm(r, 2, 2) * 0.8
    h = ground.copy()
    alb = mix(col('8c4a2b'), col('c27046'), fbm(r, 40, 3) * 0.3 + 0.5)
    alb = mix(alb, col('6f7d3a'), np.clip(fbm(r, 18, 3) - 0.7, 0, 1) * 0.9)  # scrub grass
    alb = mix(alb, col('d39a6c'), np.clip(fbm(r, 2.5, 2) * 0.3, 0, 1) * 0.5)  # dust
    piles = [(0.3, 0.27, 0.2), (0.73, 0.33, -0.25), (0.33, 0.76, -0.1)]
    for (px, py, ang) in piles:
        cx, cy = px * N, py * N
        ca, sa = np.cos(ang), np.sin(ang)
        u = (xx - cx) * ca + (yy - cy) * sa
        v = -(xx - cx) * sa + (yy - cy) * ca
        bw, bh, gap = 50, 23, 3.5
        cols, rows_ = 3, 5
        W, Hh = cols * (bw + gap), rows_ * (bh + gap)
        inpile = (np.abs(u) < W / 2) & (np.abs(v) < Hh / 2)
        level = 16 + r.uniform(0, 8)
        iu = np.floor((u + W / 2) / (bw + gap)); iv = np.floor((v + Hh / 2) / (bh + gap))
        fu = (u + W / 2) - iu * (bw + gap); fv = (v + Hh / 2) - iv * (bh + gap)
        isbrick = inpile & (fu < bw) & (fv < bh)
        edge = np.minimum(np.minimum(fu, bw - fu), np.minimum(fv, bh - fv))
        bevel = np.clip(edge / 3.5, 0, 1)
        h = np.where(inpile, ground.max() * 0 + level + np.where(isbrick, bevel * 4, -5), h)
        seed = (iu * 7 + iv * 13 + px * 100).astype(np.int64)
        shade = (np.sin(seed * 12.9898) * 43758.5453) % 1
        bc = mix(col('9e3b22'), col('cf6a3f'), shade)
        bc = mix(bc, col('5e2414'), np.clip(fbm(r, 1.5, 2) * 0.25, 0, 1) * 0.7)
        alb = np.where(isbrick[..., None], bc, np.where(inpile[..., None], col('6b5442'), alb))
    render('brick', alb, gaussian_filter(h, 0.6, mode='wrap'), shadow_len=36, slope=0.8, ambient=0.52)


# ------------------------------------------------------------------ lumber (forest)
def lumber():
    r = rng(44)
    h = fbm(r, 30, 3) * 2
    alb = mix(col('1f3517'), col('2e4a20'), fbm(r, 10, 2) * 0.3 + 0.5)
    # log pile in a clearing (top-left area)
    lx, ly, ang = 0.3 * N, 0.27 * N, np.deg2rad(-30)
    clearing = ((xx - lx) ** 2 + (yy - ly) ** 2) < (105 + fbm(r, 6, 2) * 10) ** 2
    alb[clearing] = mix(col('6b5a34'), col('8a7444'), fbm(r, 3, 2)[clearing] * 0.3 + 0.5)
    ca, sa = np.cos(ang), np.sin(ang)
    u = (xx - lx) * ca + (yy - ly) * sa
    v = -(xx - lx) * sa + (yy - ly) * ca
    logs = []
    for i, off in enumerate([-39, -13, 13, 39, -26, 0, 26]):
        z = 0 if i < 4 else 15
        logs.append((off, z))
    occupied = np.zeros_like(h, bool)
    for off, z in logs:
        rad = 13.5
        d = (v - off) / rad
        m = (np.abs(d) < 1) & (np.abs(u) < 74)
        cyl = np.sqrt(np.clip(1 - d * d, 0, 1)) * rad + z + 4
        upd = m & (cyl > h)
        h = np.where(upd, cyl, h)
        bark = mix(col('4a3220'), col('8a6440'), np.clip(np.sin(v * 1.3 + fbm(r, 1.2, 1) * 2) * 0.3 + 0.5, 0, 1))
        alb = np.where(upd[..., None], bark, alb)
        end = m & (np.abs(u) > 69)
        ring = 0.5 + 0.5 * np.sin(np.abs(v - off) * 1.4)
        alb = np.where((end & upd)[..., None], mix(col('c79a62'), col('e5c18c'), ring), alb)
        occupied |= m
    # tree crowns, big to small, avoid the centre token and the log pile
    for i in range(95):
        x, y = r.uniform(0, N, 2)
        if np.hypot(x - lx, y - ly) < 110:
            continue
        if np.hypot(x - N / 2, y - N / 2) < 0.2 * N and r.random() < 0.6:
            continue
        rad = r.uniform(42, 70) * (1 - i / 220)
        conifer = r.random() < 0.4
        sl = (slice(max(0, int(y - rad - 2)), int(y + rad + 2)), slice(max(0, int(x - rad - 2)), int(x + rad + 2)))
        dx, dy = xx[sl] - x, yy[sl] - y
        d = np.hypot(dx, dy) / rad
        if conifer:
            a = np.arctan2(dy, dx)
            d = d / (0.82 + 0.18 * np.cos(a * 7))
        m = d < 1
        top = 26 + r.uniform(0, 14)
        dome = np.sqrt(np.clip(1 - d * d, 0, 1)) * rad * 0.7 + top
        leaf = fbm(r, 1.6, 2)[sl] * (2.6 if not conifer else 1.6)
        hh = dome + leaf
        upd = m & (hh > h[sl])
        h[sl] = np.where(upd, hh, h[sl])
        base = col(['2f6b2a', '3f7d2e', '557f2c', '2b5a2a', '6b8b35'][r.integers(0, 5)]) if not conifer else col(['1e4a2a', '24533a', '2a5a2e'][r.integers(0, 3)])
        c = mix(base * 0.8, np.minimum(base * 1.3, 1), np.clip(leaf * 0.25 + 0.5, 0, 1))
        alb[sl] = np.where(upd[..., None], c, alb[sl])
    render('lumber', alb, h, shadow_len=34, slope=0.95, ambient=0.5, strength=0.7)


# ------------------------------------------------------------------ ore (mountains)
def ore():
    r = rng(55)
    ridged = np.zeros((N, N), np.float32)
    amp = 1.0
    for s in (70, 34, 16, 8, 3.5, 1.6):
        g = gaussian_filter(r.standard_normal((N, N)).astype(np.float32), s, mode='wrap')
        g /= g.std()
        ridged += amp * (1 - np.abs(g))
        amp *= 0.5
    h = ridged * 22
    dist = np.hypot(xx - N / 2, yy - N / 2) / (N / 2)
    h -= np.clip(0.42 - dist, 0, 1) * 25   # a flatter saddle for the number token
    hn = (h - h.min()) / (h.max() - h.min())
    alb = mix(col('5d6066'), col('9a9ea6'), hn * 1.2)
    alb = mix(alb, col('e9ecef'), np.clip((hn - 0.82) * 6, 0, 1))          # snowy tops
    alb = mix(alb, col('5d6b3e'), np.clip((0.3 - hn) * 4, 0, 1) * 0.6)     # scrub in valleys
    veins = np.clip(np.abs(fbm(r, 6, 3)) < 0.04, 0, 1).astype(np.float32)
    alb = mix(alb, col('4a5a78'), veins * 0.45)                              # dark ore seams
    glint = r.random((N, N)) > 0.9985
    alb[gaussian_filter(glint.astype(np.float32), 0.8) > 0.05] = col('d8dde6')
    render('ore', alb, h, shadow_len=30, slope=1.1, ambient=0.5, strength=1.2)


# ------------------------------------------------------------------ desert
def desert():
    r = rng(66)
    warp = fbm(r, 40, 3) * 30
    u = (xx * 0.85 + yy * 0.5 + warp)
    dunes = np.abs(np.sin(u / 110 * np.pi))
    h = dunes ** 1.6 * 12 + fbm(r, 60, 3) * 4
    ripples = np.sin((xx * 0.5 - yy * 0.85 + warp * 0.6) / 4.5) * 0.45
    h += ripples
    alb = mix(col('c99a5a'), col('ecd4a0'), fbm(r, 35, 3) * 0.3 + 0.55)
    for (cx, cy) in far_from_center(r, 9, 0.3, 0.47, 0.1):
        rad = r.uniform(5, 10)
        m = np.hypot(xx - cx, yy - cy) < rad * (1 + 0.3 * fbm(r, 1.2, 1))
        h = np.where(m, h + 6 + fbm(r, 1.5, 1) * 2, h)
        alb[m] = mix(col('5c5a2a'), col('7f7a3a'), 0.5)
    # one saguaro-like cactus seen from above
    cx, cy = 0.68 * N, 0.27 * N
    m = np.hypot(xx - cx, yy - cy) < 19
    h = np.where(m, np.maximum(h, 40 - np.hypot(xx - cx, yy - cy)), h); alb[m] = col('4c7a3a')
    for dx, dy in ((-32, 0), (32, 6)):
        m = np.hypot(xx - cx - dx, yy - cy - dy) < 12
        h = np.where(m, np.maximum(h, 34 - np.hypot(xx - cx - dx, yy - cy - dy)), h); alb[m] = col('4f7f3c')
    render('desert', alb, h, shadow_len=16, slope=0.9, ambient=0.55, strength=0.9)


# ------------------------------------------------------------------ sea
def sea():
    r = rng(77)
    h = fbm(r, 14, 4) * 3 + fbm(r, 4, 2, aniso=(1, 2.2)) * 1.2
    alb = mix(col('11507a'), col('1f78a6'), fbm(r, 60, 3) * 0.3 + 0.5)
    img_h = h
    gx = (np.roll(img_h, -1, 1) - np.roll(img_h, 1, 1)); gy = (np.roll(img_h, -1, 0) - np.roll(img_h, 1, 0))
    spec = np.clip(-(gx + gy) * 0.9 - 0.9, 0, 1) ** 2
    alb = np.clip(alb + spec[..., None] * col('cfeeff') * 0.7, 0, 1)
    render('sea', alb, h, shadow_len=2, slope=5, ambient=0.75, strength=0.5)


# ------------------------------------------------------------------ table (page background)
def table():
    r = rng(88)
    warp = fbm(r, 30, 3, aniso=(0.25, 3)) * 18
    grain = np.sin((yy + warp) / N * 2 * np.pi * 18) * 0.5 + 0.5
    fine = fbm(r, 1.2, 2, aniso=(0.3, 6))
    alb = mix(col('2a1a10'), col('5a3a22'), grain * 0.6 + fine * 0.12 + 0.15)
    h = grain * 0.6 + fine * 0.3
    render('table', alb, h, shadow_len=2, slope=5, ambient=0.8, strength=0.6, quality=78)


if __name__ == '__main__':
    for f in (pasture, grain, brick, lumber, ore, desert, sea, table):
        f()
