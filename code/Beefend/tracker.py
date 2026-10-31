"""Ring-code decoder for round shafts (fondue forks): IDs 1-7, readable at any rotation.

Code layout along the shaft, in units u (all bands are full rings):

    quiet(2u white) | START 3u black | 1u white | b1 | 1u | b2 | 1u | b3 | 1u | P | 1u | STOP 1u black | quiet(2u)

    bit band: 1u black = 0, 2u black = 1;  b1..b3 = ID (MSB first), P = even parity.

Decoding measures edge-to-same-edge distances (leading->leading, trailing->trailing), which
cancel blur and threshold bias, and normalises by the START and STOP pitches, which cancels
scale. START is only at one end, so the read direction (and which way the fork points) is known.

    python tracker.py gen 5 [unit_mm] [circumference_mm] [dpi]   -> ring_5.png to print and wrap
    python tracker.py test                                        -> synthetic robustness test
    python tracker.py img1.jpg img2.jpg                           -> print IDs, save annotated output/
    python tracker.py live [0|url]                                -> webcam / stream
"""

import sys
import time
from pathlib import Path

import cv2
import numpy as np

QUIET, START, GAP, STOP = 2, 3, 1, 1
N_BITS = 4  # 3 ID bits + parity
N_BARS = N_BITS + 2  # start + bits + stop


def encode(tag_id: int) -> list[tuple[bool, int]]:
    """[(is_black, width_in_u)] for the whole code, including quiet zones."""
    assert 1 <= tag_id <= 7
    bits = [(tag_id >> 2) & 1, (tag_id >> 1) & 1, tag_id & 1]
    bits.append(bits[0] ^ bits[1] ^ bits[2])
    seq = [(False, QUIET), (True, START)]
    for b in bits:
        seq += [(False, GAP), (True, 2 if b else 1)]
    seq += [(False, GAP), (True, STOP), (False, QUIET)]
    return seq


# ---------------------------------------------------------------- 1D decoding

def profile_runs(p: np.ndarray, min_contrast: float = 12) -> list[tuple[float, float]]:
    """Dark runs [(start, end)] with sub-pixel edges, using a local (min+max)/2 threshold."""
    p = p.astype(np.float32)
    win = max(9, len(p) // 4) | 1
    kernel = np.ones((1, win), np.uint8)
    hi = cv2.blur(cv2.dilate(p[None], kernel), (win, 1))[0]
    lo = cv2.blur(cv2.erode(p[None], kernel), (win, 1))[0]
    s = p - (hi + lo) / 2
    s[(hi - lo) < min_contrast] = 1.0  # flat region -> treat as light
    dark = s < 0
    flips = np.flatnonzero(dark[1:] != dark[:-1])
    edges = flips + s[flips] / (s[flips] - s[flips + 1])  # linear-interpolated zero crossing
    runs, start = [], None
    for i, e in zip(flips, edges):
        if dark[i + 1]:
            start = e
        elif start is not None:
            runs.append((start, e))
            start = None
    return runs


def decode_runs(runs: list[tuple[float, float]]):
    """Find a valid code among dark runs. Returns (id, margin, first_x, last_x, u) or None."""
    best = None
    for i in range(len(runs) - N_BARS + 1):
        w = runs[i:i + N_BARS]
        st = np.array([r[0] for r in w])
        en = np.array([r[1] for r in w])
        lead = np.diff(st)  # lead[k]  = width_k + gap
        trail = np.diff(en)  # trail[k] = gap + width_{k+1}
        u = (lead[0] / (START + GAP) + trail[-1] / (GAP + STOP)) / 2
        if u <= 0 or not 1.4 < (lead[0] / trail[-1]) < 2.8:
            continue
        # bit k measured twice: leading pitch and trailing pitch, both = width + 1u
        r = (lead[1:] + trail[:-1]) / 2 / u
        if np.any(r < 1.5) or np.any(r > 3.5):
            continue
        # quiet zones: enough light before START and after STOP
        before = st[0] - runs[i - 1][1] if i > 0 else np.inf
        after = runs[i + N_BARS][0] - en[-1] if i + N_BARS < len(runs) else np.inf
        if before < 1.2 * u or after < 1.2 * u:
            continue
        bits = (r > 2.5).astype(int)
        if bits.sum() % 2:
            continue
        tag_id = bits[0] * 4 + bits[1] * 2 + bits[2]
        if tag_id == 0:
            continue
        margin = float(np.min(np.abs(r - 2.5)))  # 0.5 = perfect, ~0 = guessing
        if best is None or margin > best[1]:
            best = (int(tag_id), margin, float(st[0]), float(en[-1]), float(u))
    return best


def decode_profile(p: np.ndarray):
    """Try both directions. Returns (id, margin, start_x, stop_x, u) in profile coords or None."""
    fwd = decode_runs(profile_runs(p))
    n = len(p) - 1
    rev = decode_runs(profile_runs(p[::-1]))
    if rev is not None:
        rev = (rev[0], rev[1], n - rev[2], n - rev[3], rev[4])
    cands = [c for c in (fwd, rev) if c is not None]
    return max(cands, key=lambda c: c[1]) if cands else None


# ---------------------------------------------------------------- 2D locating

def _regions(gray: np.ndarray, win: int):
    """Barcode-like regions: strong gradients that all point the same way (structure tensor).

    Returns [(center, shaft_direction, length_along, width_across)].
    """
    g = gray.astype(np.float32)
    gx = cv2.Sobel(g, cv2.CV_32F, 1, 0, ksize=3)
    gy = cv2.Sobel(g, cv2.CV_32F, 0, 1, ksize=3)
    jxx = cv2.blur(gx * gx, (win, win))
    jyy = cv2.blur(gy * gy, (win, win))
    jxy = cv2.blur(gx * gy, (win, win))
    energy = jxx + jyy
    coherence = np.sqrt((jxx - jyy) ** 2 + 4 * jxy ** 2) / (energy + 1e-6)
    # sum |gradient| / |sum gradient| along the dominant direction: high for alternating bars,
    # ~1 for a single edge (shaft outline, clutter), which is what separates codes from edges
    theta = 0.5 * np.arctan2(2 * jxy, jxx - jyy)
    c, s = np.cos(theta), np.sin(theta)
    along = gx * c + gy * s
    alternation = cv2.blur(np.abs(along), (win, win)) / (np.abs(cv2.blur(along, (win, win))) + 1e-6)
    mask = ((coherence > 0.6) & (energy > 1500) & (alternation > 3)).astype(np.uint8)
    n, labels, stats, _ = cv2.connectedComponentsWithStats(mask)
    out = []
    for i in range(1, n):
        if stats[i, cv2.CC_STAT_AREA] < win * win / 2:
            continue
        x, y, w, h = stats[i, :4]
        ys, xs = np.nonzero(labels[y:y + h, x:x + w] == i)
        xs, ys = xs + x, ys + y
        # dominant gradient direction of the region = shaft axis
        a = 0.5 * np.arctan2(2 * jxy[ys, xs].sum(), (jxx[ys, xs] - jyy[ys, xs]).sum())
        d = np.array([np.cos(a), np.sin(a)])
        pts = np.stack([xs, ys], 1).astype(np.float32)
        ctr = pts.mean(0)
        proj = (pts - ctr) @ d
        across = (pts - ctr) @ np.array([-d[1], d[0]])
        out.append((ctr + d * (proj.max() + proj.min()) / 2, d, float(np.ptp(proj)),
                    float(np.ptp(across))))
    return out


def _sample_line(gray_f, p0, direction, length, offset):
    t = np.arange(0, length, 0.5, dtype=np.float32)
    normal = np.array([-direction[1], direction[0]])
    pts = p0 + offset * normal + t[:, None] * direction
    xs = pts[:, 0].astype(np.float32)[None]
    ys = pts[:, 1].astype(np.float32)[None]
    return cv2.remap(gray_f, xs, ys, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)[0]


def detect(image: np.ndarray, unit_px: float | None = None, search_scale: float | None = None,
           search_unit_px: float = 4.5, wins=(9, 17, 31)) -> list[dict]:
    """[{id, center, start, stop, unit_px, votes, margin}] in input-image pixels.

    start -> stop runs from the START band to the STOP band (which way the fork points).
    Two passes: find code-like regions on a low-res copy, then read them at full res.

    unit_px: ring unit u in the input image, in pixels (every result reports it, so run once
        without it and copy the value). Sets the search window, and the search scale if
        search_scale isn't given (u ~= search_unit_px after downscaling).
    search_scale: low-res pass, as a fraction of the input size (0.25 = 480x270 from full HD).
    With neither unit_px nor search_scale, searches full res at several windows (slow).
    """
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if image.ndim == 3 else image
    if search_scale is None:
        search_scale = min(1.0, search_unit_px / unit_px) if unit_px else 1.0
    if unit_px:
        wins = (max(5, round(3 * unit_px * search_scale)) | 1,)
    small = gray if search_scale >= 1 else cv2.resize(
        gray, None, fx=search_scale, fy=search_scale, interpolation=cv2.INTER_AREA)
    gray_f = gray.astype(np.float32)
    found = []
    for win in wins:
        for ctr, d, length, width in _regions(small, win):
            # search coords -> full-res coords
            ctr = (ctr + 0.5) / search_scale - 0.5
            length, width, win_full = (x / search_scale for x in (length, width, win))
            if any(np.linalg.norm(ctr - f["center"]) < length / 2 for f in found):
                continue  # already read at another window size
            length = 1.6 * length + 2 * win_full  # reach START + quiet zones
            p0 = ctr - d * length / 2
            half = 0.3 * max(width - win_full, 2)
            votes = {}
            for off in np.linspace(-half, half, 5):
                res = decode_profile(_sample_line(gray_f, p0, d, length, off))
                if res:
                    tag_id, m, a, b, u = res
                    v = votes.setdefault(tag_id, [0, 0.0, a, b, u])
                    v[0] += 1
                    v[1] = max(v[1], m)
            if not votes:
                continue
            tag_id, (n, m, a, b, u) = max(votes.items(), key=lambda kv: kv[1][0])
            if n < 2 or n <= sum(v[0] for k, v in votes.items() if k != tag_id):
                continue  # need agreement across the parallel scan lines
            start, stop = p0 + a * 0.5 * d, p0 + b * 0.5 * d  # profile step is 0.5 px
            found.append({"id": tag_id, "center": (start + stop) / 2, "start": start,
                          "stop": stop, "unit_px": u * 0.5, "votes": n, "margin": m})
    return found


def draw(image, tags):
    out = cv2.cvtColor(image, cv2.COLOR_GRAY2BGR) if image.ndim == 2 else image.copy()
    for t in tags:
        a, b = t["start"].astype(int), t["stop"].astype(int)
        cv2.arrowedLine(out, tuple(a), tuple(b), (0, 255, 0), 2, tipLength=0.15)
        cv2.putText(out, f"{t['id']}", tuple(a + 8), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0, 0, 255), 2)
    return out


# ---------------------------------------------------------------- printing

def generate(tag_id: int, unit_mm=2.0, circ_mm=31.4, dpi=600) -> np.ndarray:
    """Printable strip: wrap the short way around the shaft so the bands become rings."""
    px = dpi / 25.4
    rows = []
    for black, w in encode(tag_id):
        rows += [0 if black else 255] * round(w * unit_mm * px)
    strip = np.repeat(np.array(rows, np.uint8)[:, None], round(circ_mm * px), axis=1)
    return cv2.copyMakeBorder(strip, 2, 2, 2, 2, cv2.BORDER_CONSTANT, value=128)  # cut line


# ---------------------------------------------------------------- synthetic test

def render(tag_id, rng, u, diam, angle, blur, noise, tilt, highlight, light):
    h, w = 480, 640
    img = rng.uniform(40, 200) + rng.normal(0, 25, (h, w))
    for _ in range(30):  # clutter
        cv2.circle(img, tuple(int(v) for v in rng.uniform(0, [w, h])),
                   int(rng.uniform(3, 25)), float(rng.uniform(0, 255)), -1)
    img = cv2.GaussianBlur(img, (0, 0), 2)
    cy, x = h / 2, w / 2 - 15 * u
    shaft = np.full((h, w), np.nan)
    shaft[int(cy - diam / 2):int(cy + diam / 2), int(x - 60):int(x + 400)] = 110  # handle
    for black, wu in encode(tag_id):
        x1 = x + wu * u
        shaft[int(cy - diam / 2):int(cy + diam / 2), int(round(x)):int(round(x1))] = 25 if black else 225
        x = x1
    rows = np.arange(h)[:, None]
    across = np.clip((rows - cy) / (diam / 2), -1, 1)
    shade = 0.55 + 0.45 * np.sqrt(1 - across ** 2)  # cylinder shading
    shade = shade + highlight * np.exp(-((across - 0.35) / 0.12) ** 2)  # specular stripe
    m = ~np.isnan(shaft)
    img[m] = (shaft * shade)[m]
    img *= np.linspace(light, 1.0, w)[None]  # lighting gradient
    M = cv2.getRotationMatrix2D((w / 2, h / 2), angle, 1.0)
    img = cv2.warpAffine(img, M, (w, h), borderMode=cv2.BORDER_REFLECT)
    src = np.float32([[0, 0], [w, 0], [w, h], [0, h]])
    dst = np.float32([[0, 0], [w, tilt * h], [w, h - tilt * h], [0, h]])  # foreshortening
    img = cv2.warpPerspective(img, cv2.getPerspectiveTransform(src, dst), (w, h),
                              borderMode=cv2.BORDER_REFLECT)
    if blur > 0:
        img = cv2.GaussianBlur(img, (0, 0), blur)
    img = np.clip(img + rng.normal(0, noise, img.shape), 0, 255).astype(np.uint8)
    ok, jpg = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 75])
    return cv2.imdecode(jpg, cv2.IMREAD_GRAYSCALE)


def selftest(trials=60):
    rng = np.random.default_rng(1)
    scenarios = {
        "easy (u=6px)": dict(u=(5, 7), blur=(0, 0.8), noise=4, highlight=0, light=1.0),
        "normal (u=4px)": dict(u=(3.5, 4.5), blur=(0.5, 1.2), noise=8, highlight=0.4, light=0.7),
        "small (u=3px)": dict(u=(2.8, 3.2), blur=(0.6, 1.2), noise=8, highlight=0.4, light=0.7),
        "tiny (u=2px)": dict(u=(1.8, 2.2), blur=(0.6, 1.0), noise=8, highlight=0.4, light=0.7),
        "blurry (u=4, s=2.5)": dict(u=(3.5, 4.5), blur=(2.0, 2.5), noise=8, highlight=0.4, light=0.7),
        "harsh (glare, dim)": dict(u=(4, 5), blur=(0.5, 1.2), noise=12, highlight=0.9, light=0.35),
    }
    for name, s in scenarios.items():
        ok = wrong = 0
        for k in range(trials):
            tag_id = k % 7 + 1
            u = rng.uniform(*s["u"])
            img = render(tag_id, rng, u, diam=rng.uniform(2.5, 5) * u,
                         angle=rng.uniform(0, 360), blur=rng.uniform(*s["blur"]),
                         noise=s["noise"], tilt=rng.uniform(0, 0.12),
                         highlight=s["highlight"], light=s["light"])
            ids = [t["id"] for t in detect(img)]
            ok += tag_id in ids
            wrong += any(i != tag_id for i in ids)
        print(f"{name:22s} read {ok:3d}/{trials}   wrong-ID frames {wrong}")


# ---------------------------------------------------------------- CLI

def main():
    args = sys.argv[1:]
    if not args:
        print(__doc__)
    elif args[0] == "gen":
        tag_id = int(args[1])
        extra = [float(a) for a in args[2:5]]
        out = Path(f"ring_{tag_id}.png")
        cv2.imwrite(str(out), generate(tag_id, *extra))
        print(f"wrote {out}")
    elif args[0] == "test":
        selftest()
    elif args[0] == "live":
        src = args[1] if len(args) > 1 else "0"
        cap = cv2.VideoCapture(int(src) if src.isdigit() else src)
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            tags = detect(frame)
            if tags:
                print(" ".join(f"id={t['id']}" for t in tags))
            cv2.imshow("rings", draw(frame, tags))
            if cv2.waitKey(1) & 0xFF == ord("q"):
                break
    else:
        Path("output").mkdir(exist_ok=True)
        for p in map(Path, args):
            img = cv2.imread(str(p))
            if img is None:
                print(f"{p}: could not read")
                continue
            t0 = time.perf_counter()
            tags = detect(img)
            ms = 1000 * (time.perf_counter() - t0)
            print(f"{p}: {ms:.0f} ms, " + (", ".join(
                f"id={t['id']} ({t['votes']}/5, u={t['unit_px']:.1f}px)" for t in tags) or "none"))
            cv2.imwrite(str(Path("output") / f"rings_{p.name}"), draw(img, tags))


if __name__ == "__main__":
    main()
