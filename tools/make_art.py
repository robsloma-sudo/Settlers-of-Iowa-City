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


# ------------------------------------------------------------------ wool -> cat paw meadow with knitted cat mittens
def _disc(h, alb, cx, cy, a, b, ang, top, colr, pw=0.7):
    pad = int(max(a, b) + 3)
    y0, y1, x0, x1 = max(0, int(cy) - pad), min(N, int(cy) + pad), max(0, int(cx) - pad), min(N, int(cx) + pad)
    if y0 >= y1 or x0 >= x1:
        return None
    X, Y = xx[y0:y1, x0:x1] - cx, yy[y0:y1, x0:x1] - cy
    u = X * np.cos(ang) + Y * np.sin(ang); v = -X * np.sin(ang) + Y * np.cos(ang)
    e = (u / a) ** 2 + (v / b) ** 2
    m = e < 1
    hh = top * np.clip(1 - e, 0, 1) ** pw
    up = m & (hh > h[y0:y1, x0:x1])
    h[y0:y1, x0:x1] = np.where(up, hh, h[y0:y1, x0:x1])
    if colr is not None:
        alb[y0:y1, x0:x1] = np.where(up[..., None], colr if np.ndim(colr) == 1 else colr[y0:y1, x0:x1], alb[y0:y1, x0:x1])
    return (y0, y1, x0, x1, u, v, up)


def _paw(h, alb, r, cx, cy, ang, k):
    """a fluffy cat paw seen from below: furry paw with pink toe beans"""
    ca, sa = np.cos(ang), np.sin(ang)
    P = lambda du, dv: (cx + du * ca - dv * sa, cy + du * sa + dv * ca)
    # furry paw + leg
    for t in np.linspace(0, 1, 6):
        _disc(h, alb, *P(-44 * k - t * 50 * k, 0), 30 * k, 30 * k, ang, (30 - 4 * t) * k, None)
    _disc(h, alb, *P(0, 0), 46 * k, 52 * k, ang, 34 * k, None, 0.55)
    for dv, du in ((-34, 26), (-12, 40), (12, 40), (34, 26)):                         # furry toes
        _disc(h, alb, *P(du * k, dv * k), 17 * k, 15 * k, ang, 34 * k, None, 0.55)
    # fur colour (tortie: black with ginger patches) over the paw and leg
    for t in np.linspace(-0.3, 1, 11):
        cxx, cyy = P(-t * 90 * k, 0)
        y0, y1, x0, x1 = max(0, int(cyy - 50 * k)), min(N, int(cyy + 50 * k)), max(0, int(cxx - 50 * k)), min(N, int(cxx + 50 * k))
        X, Y = xx[y0:y1, x0:x1] - cxx, yy[y0:y1, x0:x1] - cyy
        m = ((X ** 2 + Y ** 2) < (62 * k) ** 2) & (h[y0:y1, x0:x1] > 7)
        patch = np.clip(fbm_cache['tort'][y0:y1, x0:x1] * 1.6, 0, 1)
        c = mix(col('201a1c'), col('b86b2e'), patch)
        c = c * (0.85 + 0.3 * np.clip(fbm_cache['hair'][y0:y1, x0:x1] * 0.5 + 0.5, 0, 1))[..., None]
        alb[y0:y1, x0:x1] = np.where(m[..., None], c, alb[y0:y1, x0:x1])
        h[y0:y1, x0:x1] = np.where(m, h[y0:y1, x0:x1] + fbm_cache['hair'][y0:y1, x0:x1] * 0.8, h[y0:y1, x0:x1])
    bean = col('f4a7b6')
    _disc(h, alb, *P(-4 * k, 0), 24 * k, 29 * k, ang, 46 * k, bean, 0.5)            # main pad
    for dv, du in ((-34, 28), (-12, 42), (12, 42), (34, 28)):                         # four big toe beans
        _disc(h, alb, *P(du * k, dv * k), 11 * k, 10 * k, ang, 45 * k, bean, 0.5)


def _mitten(h, alb, r, cx, cy, ang, k, c1, c2):
    """a knitted mitten lying flat: cuff, hand and thumb with knit ribs and a stripe"""
    ca, sa = np.cos(ang), np.sin(ang)
    P = lambda du, dv: (cx + du * ca - dv * sa, cy + du * sa + dv * ca)
    parts = [_disc(h, alb, *P(0, 0), 40 * k, 27 * k, ang, 14 * k, None, 0.5),
             _disc(h, alb, *P(-2 * k, 30 * k), 16 * k, 9 * k, ang - 0.6, 12 * k, None, 0.5),
             _disc(h, alb, *P(-44 * k, 0), 14 * k, 26 * k, ang, 13 * k, None, 0.6)]
    for i, pr in enumerate(parts):
        if pr is None:
            continue
        y0, y1, x0, x1, u, v, up = pr
        knit = np.abs(np.sin(v / (3.2 * k) + np.abs(np.sin(u / (2.6 * k))) * 1.2))
        base = c2 if i == 2 else (c2 if (-14 * k < u.mean() and False) else c1)
        stripe = (np.abs(u + 14 * k) < 5 * k) & (i == 0)
        c = np.where(stripe[..., None], c2, base) * (0.8 + 0.25 * knit)[..., None]
        alb[y0:y1, x0:x1] = np.where(up[..., None], c, alb[y0:y1, x0:x1])
        h[y0:y1, x0:x1] = np.where(up, h[y0:y1, x0:x1] + knit * 1.4, h[y0:y1, x0:x1])


fbm_cache = {}


def wool():
    r = rng(12)
    fbm_cache['tort'] = fbm(r, 14, 3)
    fbm_cache['hair'] = fbm(r, 1.1, 2, aniso=(2.5, 0.5))
    h = fbm(r, 40, 4) * 2.0 + fbm(r, 1.2, 2) * 0.9
    alb = mix(col('5c9a33'), col('94c44a'), fbm(r, 60, 3) * 0.35 + 0.5)               # soft meadow
    for _ in range(220):                                                              # little flowers
        x, y = r.integers(0, N, 2)
        m = (xx - x) ** 2 + (yy - y) ** 2 < r.uniform(1.5, 3.5) ** 2
        alb[m] = col(['f5f1e2', 'f7c6d9', 'd9d0f5'][r.integers(0, 3)]); h[m] += 0.6
    _paw(h, alb, r, 0.3 * N, 0.3 * N, np.deg2rad(-35), 1.15)                         # cat paws reaching in
    _paw(h, alb, r, 0.72 * N, 0.73 * N, np.deg2rad(150), 1.05)
    _mitten(h, alb, r, 0.72 * N, 0.28 * N, np.deg2rad(115), 1.75, col('d8443c'), col('f4efe2'))   # knitted mittens
    _mitten(h, alb, r, 0.27 * N, 0.73 * N, np.deg2rad(-60), 1.65, col('2f8f9a'), col('f2c94c'))
    render('wool', alb, h, shadow_len=34, slope=0.75, ambient=0.5, strength=0.9)


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


# ------------------------------------------------------------------ brick -> pink elephants on red-clay savanna
def _blob(h, alb, cx, cy, ang, a, b, top, colr, r, wrinkle=0.0):
    pad = int(max(a, b) + 4)
    y0, y1, x0, x1 = max(0, int(cy) - pad), min(N, int(cy) + pad), max(0, int(cx) - pad), min(N, int(cx) + pad)
    if y0 >= y1 or x0 >= x1:
        return
    X, Y = xx[y0:y1, x0:x1] - cx, yy[y0:y1, x0:x1] - cy
    u = X * np.cos(ang) + Y * np.sin(ang)
    v = -X * np.sin(ang) + Y * np.cos(ang)
    e = (u / a) ** 2 + (v / b) ** 2
    m = e < 1
    hh = top * np.sqrt(np.clip(1 - e, 0, 1)) ** 0.8 + (gaussian_filter(r.standard_normal(e.shape), 1.6) * wrinkle * 4 if wrinkle else 0)
    up = m & (hh > h[y0:y1, x0:x1])
    shade = colr * (0.92 + 0.08 * np.clip(1 - e, 0, 1))[..., None]
    h[y0:y1, x0:x1] = np.where(up, hh, h[y0:y1, x0:x1])
    alb[y0:y1, x0:x1] = np.where(up[..., None], shade, alb[y0:y1, x0:x1])


def _elephant(h, alb, r, cx, cy, ang, k=1.0):
    pink, ear, dark, tusk = col('f2a3c7'), col('e58ab3'), col('3a2430'), col('f6f1e4')
    ca, sa = np.cos(ang), np.sin(ang)
    P = lambda du, dv: (cx + du * ca - dv * sa, cy + du * sa + dv * ca)
    # tail
    for t in np.linspace(0, 1, 8):
        x, y = P(-64 * k - t * 18 * k, np.sin(t * 3) * 4 * k)
        _blob(h, alb, x, y, ang, 3 * k, 3 * k, 18 * k, pink * 0.9, r)
    _blob(h, alb, *P(0, 0), ang, 66 * k, 46 * k, 44 * k, pink, r, wrinkle=0.35)          # body
    for s_ in (-1, 1):                                                                   # big flappy ears
        _blob(h, alb, *P(40 * k, s_ * 40 * k), ang + s_ * 0.35, 24 * k, 32 * k, 36 * k, ear, r, wrinkle=0.25)
    _blob(h, alb, *P(58 * k, 0), ang, 30 * k, 28 * k, 42 * k, pink, r, wrinkle=0.3)       # head
    for s_ in (-1, 1):
        _blob(h, alb, *P(66 * k, s_ * 15 * k), ang, 3 * k, 3 * k, 44 * k, dark, r)          # eyes
        for t in np.linspace(0, 1, 6):                                                   # tusks
            _blob(h, alb, *P(80 * k + t * 14 * k, s_ * (11 * k + t * 5 * k)), ang, 2.6 * k, 2.6 * k, 30 * k, tusk, r)
    curl = r.choice([-1, 1])
    for t in np.linspace(0, 1, 16):                                                      # curling trunk
        du = 82 * k + t * 34 * k
        dv = curl * (np.sin(t * 2.6) * 16 * k)
        _blob(h, alb, *P(du, dv), ang, (9 - 4 * t) * k, (9 - 4 * t) * k, (34 - 10 * t) * k, pink * (0.97 - 0.05 * t), r, wrinkle=0.2)


def brick():
    r = rng(34)
    h = fbm(r, 70, 4) * 6 + fbm(r, 2, 2) * 0.8
    alb = mix(col('9a5230'), col('c9784c'), fbm(r, 40, 3) * 0.3 + 0.5)                   # red clay plains
    alb = mix(alb, col('a68d45'), np.clip(fbm(r, 16, 3) - 0.45, 0, 1) * 0.9)              # dry savanna grass
    alb = mix(alb, col('d8a274'), np.clip(fbm(r, 2.5, 2) * 0.3, 0, 1) * 0.5)              # dust
    # a little watering hole
    wx, wy = 0.73 * N, 0.27 * N
    d = np.hypot((xx - wx) / 1.4, yy - wy) / (52 + fbm(r, 6, 2) * 6)
    water = d < 1
    h = np.where(water, h - 4 * np.clip(1 - d, 0, 1), h)
    alb = np.where(water[..., None], mix(col('2f6d80'), col('6fb2c2'), np.clip(1 - d, 0, 1)), alb)
    alb = np.where(((d > 1) & (d < 1.18))[..., None], col('6e4128'), alb)                # wet mud ring
    for (x, y, a, k) in [(0.25 * N, 0.29 * N, 0.5, 1.25), (0.29 * N, 0.74 * N, -0.6, 1.2), (0.75 * N, 0.7 * N, 2.6, 0.8)]:
        _elephant(h, alb, r, x, y, a, k)
    render('brick', alb, h, shadow_len=40, slope=0.85, ambient=0.52, strength=0.8)


# ------------------------------------------------------------------ lumber -> JUUL pods scattered on a dark slate table
POD_COLORS = ['2fbfa8', 'f28c28', 'e8475f', '8d6ad6', 'f2d33c', '3b8ee8', 'f2f2f2']


def _pod(h, alb, cx, cy, ang, k, tip):
    ca, sa = np.cos(ang), np.sin(ang)
    L, W = 26 * k, 10 * k
    pad = int(L + 4)
    y0, y1, x0, x1 = max(0, int(cy) - pad), min(N, int(cy) + pad), max(0, int(cx) - pad), min(N, int(cx) + pad)
    if y0 >= y1 or x0 >= x1:
        return
    X, Y = xx[y0:y1, x0:x1] - cx, yy[y0:y1, x0:x1] - cy
    u = X * ca + Y * sa; v = -X * sa + Y * ca
    rr = 3 * k
    q = np.hypot(np.maximum(np.abs(u) - (L - rr), 0), np.maximum(np.abs(v) - (W - rr), 0))
    m = q < rr
    edge = np.minimum(L - np.abs(u), W - np.abs(v))
    hh = 6 + np.clip(edge / (3 * k), 0, 1) * 6 * k
    up = m & (hh > h[y0:y1, x0:x1])
    capm = u > L * 0.18                                    # coloured mouthpiece end
    body = mix(col('c9d3d6'), col('f4f8f8'), np.clip(1 - np.abs(v) / W, 0, 1))      # clear plastic
    liquid = (u < L * 0.05) & (u > -L * 0.8) & (np.abs(v) < W * 0.55)
    c = np.where(capm[..., None], tip * (0.8 + 0.3 * np.clip(1 - np.abs(v) / W, 0, 1))[..., None],
                 np.where(liquid[..., None], mix(col('d9b36a'), col('f2dca0'), 0.5), body))
    slot = capm & (np.abs(v) < W * 0.18) & (u > L * 0.55)                           # mouthpiece slot
    c = np.where(slot[..., None], tip * 0.45, c)
    h[y0:y1, x0:x1] = np.where(up, hh, h[y0:y1, x0:x1])
    alb[y0:y1, x0:x1] = np.where(up[..., None], c, alb[y0:y1, x0:x1])


def lumber():
    r = rng(45)
    h = fbm(r, 40, 3) * 1.2 + fbm(r, 1.5, 2) * 0.35
    alb = mix(col('2b2142'), col('47386e'), fbm(r, 30, 3) * 0.3 + 0.5)               # deep purple lounge table
    alb = mix(alb, col('5a4a86'), np.clip(fbm(r, 2, 2) * 0.2, 0, 1) * 0.5)
    # an open four-pack box (top-left)
    bx, by, ang = 0.29 * N, 0.29 * N, np.deg2rad(-20)
    ca, sa = np.cos(ang), np.sin(ang)
    u = (xx - bx) * ca + (yy - by) * sa; v = -(xx - bx) * sa + (yy - by) * ca
    box = (np.abs(u) < 74) & (np.abs(v) < 56)
    wall = box & ((np.abs(u) > 66) | (np.abs(v) > 48))
    h = np.where(box, np.where(wall, 22.0, 4.0), h)
    alb = np.where(wall[..., None], col('e9ecee'), np.where(box[..., None], col('1d2124'), alb))
    for k2, dv in enumerate((-33, -11, 11, 33)):
        _pod(h, alb, bx + 0 * ca - dv * sa, by + 0 * sa + dv * ca, ang, 2.2, col(POD_COLORS[k2]))
    # loose pods everywhere else (kept off the centre token)
    pts = far_from_center(r, 15, 0.26, 0.47, 0.085, pts=[(0.29, 0.29)])
    for i, (x, y) in enumerate(pts):
        if np.hypot(x - bx, y - by) < 120:
            continue
        _pod(h, alb, x, y, r.uniform(0, np.pi), r.uniform(1.5, 1.9), col(POD_COLORS[r.integers(0, len(POD_COLORS))]))
    # a slim grey device lying on the table (no branding)
    dx, dy, da = 0.72 * N, 0.74 * N, np.deg2rad(35)
    uu = (xx - dx) * np.cos(da) + (yy - dy) * np.sin(da); vv = -(xx - dx) * np.sin(da) + (yy - dy) * np.cos(da)
    dev = np.hypot(np.maximum(np.abs(uu) - 82, 0), np.maximum(np.abs(vv) - 10, 0)) < 7
    h = np.where(dev, 14 + np.clip(17 - np.abs(vv), 0, 17) * 0.4, h)
    alb = np.where(dev[..., None], mix(col('6f777c'), col('b9c1c5'), np.clip(1 - np.abs(vv) / 17, 0, 1)), alb)
    led = (np.abs(uu - 30) < 4) & (np.abs(vv) < 3)
    alb = np.where(led[..., None], col('8ee6ff'), alb)
    _pod(h, alb, dx + 92 * np.cos(da), dy + 92 * np.sin(da), da, 1.55, col('2fbfa8'))
    render('lumber', alb, h, shadow_len=22, slope=0.7, ambient=0.5, strength=0.9)


# ------------------------------------------------------------------ ore -> Montenegro: stone cellar with amber liqueur bottles
def _capsule(h, alb, ax, ay, bx, by, rad, top, colr, cap=None):
    pad = int(rad + 3)
    x0, x1 = max(0, int(min(ax, bx)) - pad), min(N, int(max(ax, bx)) + pad)
    y0, y1 = max(0, int(min(ay, by)) - pad), min(N, int(max(ay, by)) + pad)
    X, Y = xx[y0:y1, x0:x1], yy[y0:y1, x0:x1]
    dx, dy = bx - ax, by - ay
    t = np.clip(((X - ax) * dx + (Y - ay) * dy) / (dx * dx + dy * dy), 0, 1)
    d = np.hypot(X - (ax + t * dx), Y - (ay + t * dy)) / rad
    m = d < 1
    hh = top + rad * 0.8 * np.sqrt(np.clip(1 - d * d, 0, 1))
    up = m & (hh > h[y0:y1, x0:x1])
    c = colr(t, d) if callable(colr) else colr
    h[y0:y1, x0:x1] = np.where(up, hh, h[y0:y1, x0:x1])
    alb[y0:y1, x0:x1] = np.where(up[..., None], c, alb[y0:y1, x0:x1])


def _amber(t, d):
    glow = np.clip(1 - d, 0, 1)
    c = mix(col('5a2a0c'), col('d77a1f'), glow * 0.9)
    return np.where(((d < 0.25) & (glow > 0))[..., None], np.minimum(c * 1.6, 1), c)   # glassy highlight


def ore():
    r = rng(56)
    # grey flagstone cellar floor (keeps the "stone" look of the old mountains)
    pts = r.uniform(0, N, (46, 2))
    d = np.stack([np.minimum.reduce([np.hypot(((xx - px + dxw) % N) - 0, yy - py) for dxw in (0,)]) for px, py in pts])
    d = np.stack([np.hypot(np.minimum(np.abs(xx - px), N - np.abs(xx - px)), np.minimum(np.abs(yy - py), N - np.abs(yy - py))) for px, py in pts])
    ds = np.sort(d, axis=0)
    edge = ds[1] - ds[0]
    idx = np.argmin(d, axis=0)
    tone = (np.sin(idx * 12.9898) * 43758.5453) % 1
    h = np.clip(edge / 6, 0, 1) * 4 + fbm(r, 3, 2) * 0.6
    alb = mix(col('6d6a66'), col('a6a29a'), tone * 0.7 + fbm(r, 6, 2) * 0.1)
    alb = mix(alb, col('8a7d6a'), np.clip(fbm(r, 30, 3) * 0.4, 0, 1) * 0.4)
    alb = np.where((edge < 3)[..., None], col('3f3b37'), alb)
    # wooden crate of bottles (top-left)
    cx, cy, ang, S = 0.3 * N, 0.29 * N, np.deg2rad(-12), 150
    ca, sa = np.cos(ang), np.sin(ang)
    u = (xx - cx) * ca + (yy - cy) * sa; v = -(xx - cx) * sa + (yy - cy) * ca
    inside = (np.abs(u) < S / 2) & (np.abs(v) < S / 2)
    wall = inside & ((np.abs(u) > S / 2 - 11) | (np.abs(v) > S / 2 - 11))
    wood = mix(col('6b4423'), col('a8743f'), np.clip(np.sin(u * 0.35 + fbm(r, 2, 1) * 2) * 0.3 + 0.5, 0, 1))
    h = np.where(inside, np.where(wall, 34.0, 8.0), h)
    alb = np.where(wall[..., None], wood, np.where(inside[..., None], col('2c1d12'), alb))
    for i in (-1, 0, 1):
        for j in (-1, 0, 1):
            bx, by = cx + (i * 44) * ca - (j * 44) * sa, cy + (i * 44) * sa + (j * 44) * ca
            _disc(h, alb, bx, by, 20, 20, 0, 48, None, 0.45)
            y0, y1, x0, x1 = int(by - 21), int(by + 21), int(bx - 21), int(bx + 21)
            dd = np.hypot(xx[y0:y1, x0:x1] - bx, yy[y0:y1, x0:x1] - by) / 20
            alb[y0:y1, x0:x1] = np.where((dd < 1)[..., None], _amber(None, dd), alb[y0:y1, x0:x1])
            _disc(h, alb, bx, by, 9, 9, 0, 60, col('6e3410'), 0.5)          # neck
            _disc(h, alb, bx, by, 7, 7, 0, 64, col('c9a227'), 0.3)          # gold cap
    # two bottles lying on the floor
    for (ax, ay, bx, by) in [(0.14 * N, 0.72 * N, 0.36 * N, 0.82 * N), (0.62 * N, 0.86 * N, 0.82 * N, 0.68 * N)]:
        _capsule(h, alb, ax, ay, ax + (bx - ax) * 0.72, ay + (by - ay) * 0.72, 20, 4, _amber)
        _capsule(h, alb, ax + (bx - ax) * 0.72, ay + (by - ay) * 0.72, bx, by, 8, 6, col('7a3a12'))
        _capsule(h, alb, bx - (bx - ax) * 0.04, by - (by - ay) * 0.04, bx + (bx - ax) * 0.03, by + (by - ay) * 0.03, 8.5, 8, col('c9a227'))
        mx, my = ax + (bx - ax) * 0.35, ay + (by - ay) * 0.35
        _capsule(h, alb, mx - (bx - ax) * 0.08, my - (by - ay) * 0.08, mx + (bx - ax) * 0.08, my + (by - ay) * 0.08, 20.5, 4.5, col('efe4c6'))   # plain cream label
    # a tumbler with amber liqueur and ice (top-right)
    tx, ty = 0.74 * N, 0.3 * N
    dd = np.hypot(xx - tx, yy - ty)
    rim = (dd < 50) & (dd > 42)
    liquid = dd <= 42
    h = np.where(rim, 30.0, np.where(liquid, 22.0, h))
    alb = np.where(rim[..., None], col('dfe6ea'), alb)
    alb = np.where(liquid[..., None], mix(col('7a3a10'), col('e08a2a'), np.clip(1 - dd / 42, 0, 1)), alb)
    for (ix, iy, a2) in [(-12, -9, 0.3), (13, 10, -0.5)]:
        uu = (xx - tx - ix) * np.cos(a2) + (yy - ty - iy) * np.sin(a2); vv = -(xx - tx - ix) * np.sin(a2) + (yy - ty - iy) * np.cos(a2)
        cube = (np.abs(uu) < 14) & (np.abs(vv) < 14) & liquid
        h = np.where(cube, 27.0 + (14 - np.maximum(np.abs(uu), np.abs(vv))) * 0.2, h)
        alb = np.where(cube[..., None], col('f4f1ea') * 0.95, alb)
    render('ore', alb, h, shadow_len=34, slope=0.9, ambient=0.5, strength=0.8)


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
    for f in (wool, grain, brick, lumber, ore, desert, sea, table):
        f()
