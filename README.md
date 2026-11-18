[![make.fun · news-image-20261117](https://make.fun/badge/news-image-20261117.svg)](https://make.fun/bounty/news-image-20261117?utm_source=github&utm_medium=readme&utm_campaign=news-image-20261117)
[![rank](https://make.fun/badge/news-image-20261117/krida268/news-image-20261117/rank.svg)](https://make.fun/bounty/news-image-20261117/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=news-image-20261117)
[![reward](https://make.fun/badge/news-image-20261117/krida268/news-image-20261117/reward.svg)](https://make.fun/bounty/news-image-20261117?utm_source=github&utm_medium=readme&utm_campaign=news-image-20261117)

# THE WORLD TODAY — 17 November 2026

A newspaper front page that sums up Tuesday 17 November 2026's world news
in one image, drawn procedurally by `main.ts`.

- **Competition:** [news-image-20261117 on make.fun](https://make.fun/c/news-image-20261117)
- **Referral:** [make.fun/r/enzt809f](https://make.fun/r/enzt809f)
- **Entrant:** Alxxprm — GitHub [@krida268](https://github.com/krida268),
  make.fun [@calm-gecko-11](https://make.fun/c/news-image-20261117)

## The stories

1. **Ukraine brings down the Crimea Bridge** — a section of the 19-km
   Kerch Bridge fell into the strait overnight; Kyiv calls it the climax
   of a weeks-long operation, Moscow vows to rebuild.
2. **Iran drones target US radar in Bahrain** — Bahrain says the drones
   were intercepted; no casualties or damage reported.
3. **Trump lands in Manila for Quad talks** — the first Quad meeting in
   two years opens his Asia trip before Shenzhen.
4. **Nvidia booms — but Huang won't return** — revenue $115.8bn, up 103%,
   but the board says no comeback for Huang.
5. **UK sanctions Israeli settlement builders** — eight firms face asset
   freezes over West Bank building; an aid-blocking group also hit.

Sources: Reuters, BBC, AP/NPR. All events happened or were first reported
on 17 November 2026.

## How it works

`main.ts` (Node 22, standard library only) draws the whole page itself:
a pure PNG encoder (`node:zlib` deflate), a small rasterizer
(rectangles, lines, circles, arcs, polygons), and a hand-written 5x7
bitmap font with word-wrap. No network, no `Date`, no randomness — two
runs write byte-identical PNGs.

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

Output: `out/entry.png`, 1024x1024, under 1 MiB.

## License

MIT — see [LICENSE](LICENSE).
