# CLAUDE.md — Colourdle

A colour-naming game at [colourdle.ca](https://colourdle.ca). See a colour, guess its name, score by name closeness and perceptual colour distance.

## Architecture

Static HTML/CSS/JS served via GitHub Pages from `docs/` on `master`. Zero backend, zero build step for the game itself.

```
docs/
  index.html    — main game page
  about.html    — rules, scoring formula, algorithm docs
  style.css     — all styles (dark mode via .dark class)
  game.js       — game engine, POEM matching, scoring, UI
  colors.js     — auto-generated colour database (~3,300 entries)
  CNAME         — custom domain config
worker/
  src/index.js  — Cloudflare Worker for anonymous percentile scoring
build_colors.py — generates colors.js from source datasets
.githooks/
  pre-commit    — stamps ?v= cache-busting params on HTML assets
```

## Key Systems

### POEM Matching (game.js)

Fuzzy name matching uses POEM (Pareto-Optimal Embedded Matching), adapted from [Brereton et al. 2020](https://iopscience.iop.org/article/10.1088/2632-2153/ab891b). Six string similarity measures combined via Pareto dominance:

1. Levenshtein distance (normalized)
2. Word-sorted Levenshtein (order-independent)
3. Character bigram Dice coefficient
4. Word-level Jaccard distance
5. Longest common substring ratio
6. Word containment (query words in candidate)

Pipeline: compute all distances → prune to top 50% per measure (union of survivors) → find Pareto front → tiebreak by mean distance.

Weighted objectives are possible by duplicating measure columns (not yet used).

### Scoring (game.js)

- **Name score**: POEM rank-based — where the target lands in the mean-distance ranking of all pool names, with quadratic curve: `round((1 - rank / (N-1))^2 * 100)`
- **Colour score**: CIELAB Delta E through sigmoid: `100 / (1 + (dE / 30)^1.8)`
- **Combined**: Power mean (p=3) of both scores
- **Bonus**: 2x multiplier for exact hex match

### Daily Puzzle Seeding

`hashString('colourdle-' + type + '-' + palette + '-' + dayNum)` with Mulberry32 PRNG. Day number counts from local midnight epoch. Each game mode × palette combination has its own daily puzzle.

## Development

### Rebuilding colours

```bash
python3 build_colors.py
```

Sources: Crayola, Pantone, XKCD, RAL. Output: `docs/colors.js`.

### Deploy

Push to `master`. GitHub Pages deploys automatically within 1-2 minutes.

**Cache busting**: The pre-commit hook stamps `?v=<timestamp>` on asset URLs in HTML files. GitHub PR merges bypass local hooks, so bump manually after merge:

```bash
stamp=$(date +%s) && sed -i "s/?v=[^\"']*/?v=$stamp/g" docs/index.html docs/about.html
```

### DNS

Cloudflare DNS-only (no proxy). Proxy mode causes stale cache issues with GitHub Pages.

### Cloudflare Worker (percentile scores)

```bash
cd worker && npx wrangler deploy
```

Anonymous score submission for daily puzzles. KV storage with 48h TTL. Perfect scores are excluded from percentile and show a special message.

## Conventions

- All game logic in a single `game.js` IIFE — no modules, no bundler
- `var` in the POEM/matching code (ES5-compatible hot path), `const`/`let` elsewhere
- Colour data is `const COLOURS = [{ name, hex, src }]` — never edit colors.js manually
- Dark mode: CSS custom properties toggled by `.dark` class on `<html>`
