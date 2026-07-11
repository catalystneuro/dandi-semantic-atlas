#!/usr/bin/env python3
"""Render the Open Graph social card (public/og.png) from the atlas data.

Reproduces the branded look — cream ground, faint grid, and a halftone cloud of
the actual topic clusters — with the current title, so the card never drifts out
of sync with the app after a rename.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import numpy as np
from matplotlib import font_manager
from matplotlib import pyplot as plt
from matplotlib.colors import to_rgba

W, H = 1200, 630
CREAM = "#f7f8f4"
INK = "#1b3d33"
GREEN = "#1d5c4a"
TITLE_LINES = ["DANDI", "Semantic Atlas"]
SUBTITLE = "Find data by following ideas."
# App's default 3D view, so the card matches the map's opening angle.
ROT_X, ROT_Y = -0.18, 0.42
DOTS_PER_POINT = 22


def font(candidates: list[str], family: str) -> font_manager.FontProperties:
    for path in candidates:
        if Path(path).exists():
            return font_manager.FontProperties(fname=path)
    return font_manager.FontProperties(family=family)


def main() -> None:
    data = json.loads(Path("public/data/dandisets.json").read_text())
    color_of = {c["id"]: c["color"] for c in data["clusters"]}
    ds = data["dandisets"]

    x = np.array([d["x"] for d in ds]); y = np.array([d["y"] for d in ds]); z = np.array([d["z"] for d in ds])
    labels = [d["cluster"] for d in ds]

    px, py, pz = (x - .5) * 2, (y - .5) * 2, (z - .5) * 2
    cy, sy = math.cos(ROT_Y), math.sin(ROT_Y)
    cx, sx = math.cos(ROT_X), math.sin(ROT_X)
    x1 = px * cy - pz * sy
    z1 = px * sy + pz * cy
    y1 = py * cx - z1 * sx
    depth = py * sx + z1 * cx

    def norm(a):
        return (a - a.min()) / (a.max() - a.min() or 1)
    # Fill the frame, biased right so the headline has clear space on the left.
    cx_pt = (0.20 + norm(x1) * 0.78) * W
    cy_pt = (0.10 + norm(y1) * 0.82) * H
    dnorm = norm(depth)

    rng = np.random.default_rng(42)
    order = np.argsort(depth)  # far to near, painter's algorithm

    sx_all, sy_all, cols, sizes = [], [], [], []
    for i in order:
        base = to_rgba(color_of.get(labels[i], "#9aa4ae"))
        spread = 6.5 + dnorm[i] * 5
        jx = rng.normal(0, spread, DOTS_PER_POINT)
        jy = rng.normal(0, spread, DOTS_PER_POINT)
        alpha = (0.4 + dnorm[i] * 0.5) * (0.4 if labels[i] == -1 else 1.0)
        for k in range(DOTS_PER_POINT):
            sx_all.append(cx_pt[i] + jx[k]); sy_all.append(cy_pt[i] + jy[k])
            cols.append((base[0], base[1], base[2], float(np.clip(alpha * rng.uniform(0.6, 1.0), 0, 1))))
            sizes.append(float((2 + dnorm[i] * 10) * rng.uniform(0.5, 1.4)) ** 2 * 0.5)

    fig = plt.figure(figsize=(W / 100, H / 100), dpi=100)
    ax = fig.add_axes([0, 0, 1, 1]); ax.set_xlim(0, W); ax.set_ylim(H, 0); ax.axis("off")
    ax.add_patch(plt.Rectangle((0, 0), W, H, color=CREAM, zorder=0))

    for gx in range(0, W, 74):
        ax.plot([gx, gx], [0, H], color=(0.1, 0.16, 0.15), alpha=0.05, lw=1, zorder=1)
    for gy in range(0, H, 74):
        ax.plot([0, W], [gy, gy], color=(0.1, 0.16, 0.15), alpha=0.05, lw=1, zorder=1)

    ax.scatter(sx_all, sy_all, s=sizes, c=cols, linewidths=0, zorder=2)

    # Fade the left third back to cream so the headline stays legible.
    ramp = np.linspace(0, 1, W)
    alpha = np.clip((0.42 - ramp) / 0.42, 0, 1) ** 1.4
    overlay = np.zeros((2, W, 4)); overlay[..., :3] = to_rgba(CREAM)[:3]; overlay[..., 3] = alpha
    ax.imshow(overlay, extent=(0, W, 0, H), aspect="auto", zorder=3)

    serif = font(["/System/Library/Fonts/Supplemental/Georgia.ttf", "/Library/Fonts/Georgia.ttf"], "serif")
    sans = font(["/System/Library/Fonts/Supplemental/Arial.ttf", "/System/Library/Fonts/Helvetica.ttc"], "sans-serif")
    ax.text(70, 250, TITLE_LINES[0], fontproperties=serif, fontsize=92, color=INK, zorder=4, va="baseline")
    ax.text(70, 340, TITLE_LINES[1], fontproperties=serif, fontsize=60, color=INK, zorder=4, va="baseline")
    ax.text(74, 400, SUBTITLE, fontproperties=sans, fontsize=27, color=GREEN, zorder=4, va="baseline")

    out = Path("public/og.png")
    fig.savefig(out, dpi=100)
    plt.close(fig)
    print(f"wrote {out} ({W}x{H})")


if __name__ == "__main__":
    main()
