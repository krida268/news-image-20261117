// THE WORLD TODAY — one-day world news image for Tuesday 17 November 2026.
// Draws a 1024x1024 newspaper front page procedurally: pure PNG encoder
// (node:zlib deflate), a small rasterizer and a hand-written 5x7 bitmap font.
// Standard library only, no network, no Date, no randomness: two runs write
// byte-identical files.
import * as fs from "node:fs";
import * as path from "node:path";
import * as zlib from "node:zlib";

const W = 1024;
const H = 1024;

// Palette: cream paper, ink, newspaper red, deep blue, gold.
const CREAM = 0xf7f3e8;
const INK = 0x111111;
const RED = 0xc0392b;
const BLUE = 0x1b3a5c;
const GOLD = 0xd4a017;
const WHITE = 0xffffff;
const SKY1 = 0xe8823f;
const SKY2 = 0xd95a2b;
const SKY3 = 0xa93226;
const WATER = 0x2e6fa3;
const WATER_LT = 0x7fb3d5;
const GREEN = 0x1e7a34;
const GREEN_LT = 0x2fa84f;
const STEEL = 0x3a3a3a;
const SMOKE = 0x9a938a;
const SAND = 0xe8dcc0;
const PALE = 0xf2e3b6;

function rgb(c: number): [number, number, number] {
  return [(c >> 16) & 0xff, (c >> 8) & 0xff, c & 0xff];
}

// ---------------------------------------------------------------- PNG encoder
const CRC_TABLE: number[] = (() => {
  const t: number[] = new Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 4, "ascii");
  data.copy(out, 8);
  const crc = crc32(Buffer.concat([Buffer.from(type, "ascii"), data]));
  out.writeUInt32BE(crc, 8 + data.length);
  return out;
}

function encodePng(pixels: Uint8Array, width: number, height: number): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type 2 = RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const raw = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    const rowStart = y * (1 + width * 3);
    raw[rowStart] = 0; // filter: none
    raw.set(pixels.subarray(y * width * 3, (y + 1) * width * 3), rowStart + 1);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ------------------------------------------------------------------- Canvas
class Canvas {
  buf: Uint8Array;
  constructor() {
    this.buf = new Uint8Array(W * H * 3);
    const [r, g, b] = rgb(CREAM);
    for (let i = 0; i < W * H; i++) {
      this.buf[i * 3] = r;
      this.buf[i * 3 + 1] = g;
      this.buf[i * 3 + 2] = b;
    }
  }
  px(x: number, y: number, c: number): void {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const [r, g, b] = rgb(c);
    const i = (y * W + x) * 3;
    this.buf[i] = r;
    this.buf[i + 1] = g;
    this.buf[i + 2] = b;
  }
  rect(x: number, y: number, w: number, h: number, c: number): void {
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(W, Math.ceil(x + w));
    const y1 = Math.min(H, Math.ceil(y + h));
    const [r, g, b] = rgb(c);
    for (let yy = y0; yy < y1; yy++) {
      let i = (yy * W + x0) * 3;
      for (let xx = x0; xx < x1; xx++) {
        this.buf[i] = r;
        this.buf[i + 1] = g;
        this.buf[i + 2] = b;
        i += 3;
      }
    }
  }
  hline(x0: number, x1: number, y: number, c: number, t = 1): void {
    this.rect(Math.min(x0, x1), y, Math.abs(x1 - x0), t, c);
  }
  vline(x: number, y0: number, y1: number, c: number, t = 1): void {
    this.rect(x, Math.min(y0, y1), t, Math.abs(y1 - y0), c);
  }
  outline(x: number, y: number, w: number, h: number, c: number, t = 1): void {
    this.rect(x, y, w, t, c);
    this.rect(x, y + h - t, w, t, c);
    this.rect(x, y, t, h, c);
    this.rect(x + w - t, y, t, h, c);
  }
  line(x0: number, y0: number, x1: number, y1: number, c: number): void {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const steps = Math.max(Math.abs(dx), Math.abs(dy));
    if (steps === 0) {
      this.px(x0, y0, c);
      return;
    }
    for (let i = 0; i <= steps; i++) {
      const x = Math.round(x0 + (dx * i) / steps);
      const y = Math.round(y0 + (dy * i) / steps);
      this.px(x, y, c);
    }
  }
  // Thick line drawn as a filled quad.
  thickLine(x0: number, y0: number, x1: number, y1: number, w: number, c: number): void {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) return;
    const nx = (-dy / len) * (w / 2);
    const ny = (dx / len) * (w / 2);
    this.polygon(
      [
        [x0 + nx, y0 + ny],
        [x1 + nx, y1 + ny],
        [x1 - nx, y1 - ny],
        [x0 - nx, y0 - ny],
      ],
      c,
    );
  }
  circle(cx: number, cy: number, r: number, c: number): void {
    for (let dy = -r; dy <= r; dy++) {
      const dx = Math.floor(Math.sqrt(r * r - dy * dy));
      this.hline(cx - dx, cx + dx + 1, cy + dy, c);
    }
  }
  ring(cx: number, cy: number, r: number, c: number, t = 2): void {
    for (let a = 0; a < 360; a += 2) {
      const rad = (a * Math.PI) / 180;
      const x = Math.round(cx + Math.cos(rad) * r);
      const y = Math.round(cy + Math.sin(rad) * r);
      this.rect(x, y, t, t, c);
    }
  }
  // Arc from angle a0 to a1 (degrees, 0 = east, going clockwise in screen coords).
  arc(cx: number, cy: number, r: number, a0: number, a1: number, c: number, t = 2): void {
    for (let a = a0; a <= a1; a += 2) {
      const rad = (a * Math.PI) / 180;
      const x = Math.round(cx + Math.cos(rad) * r);
      const y = Math.round(cy + Math.sin(rad) * r);
      this.rect(x, y, t, t, c);
    }
  }
  triangle(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, c: number): void {
    this.polygon(
      [
        [x0, y0],
        [x1, y1],
        [x2, y2],
      ],
      c,
    );
  }
  polygon(pts: Array<[number, number]>, c: number): void {
    let minY = Infinity;
    let maxY = -Infinity;
    for (const [, y] of pts) {
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    const y0 = Math.max(0, Math.floor(minY));
    const y1 = Math.min(H - 1, Math.ceil(maxY));
    for (let y = y0; y <= y1; y++) {
      const xs: number[] = [];
      for (let i = 0; i < pts.length; i++) {
        const [ax, ay] = pts[i];
        const [bx, by] = pts[(i + 1) % pts.length];
        if ((ay <= y && by > y) || (by <= y && ay > y)) {
          const t = (y - ay) / (by - ay);
          xs.push(ax + t * (bx - ax));
        }
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        this.hline(Math.round(xs[k]), Math.round(xs[k + 1]) + 1, y, c);
      }
    }
  }
}

// ------------------------------------------------------------- Bitmap font
// Hand-written 5x7 glyphs. '#' is an ink pixel, '.' is empty.
const FONT: Record<string, string[]> = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01111", "10000", "10000", "10111", "10001", "10001", "01110"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
  J: ["00111", "00010", "00010", "00010", "00010", "10010", "01100"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "11001", "10101", "10011", "10011", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "11011", "10001"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  a: ["00000", "00000", "01111", "00001", "01111", "10001", "01111"],
  b: ["10000", "10000", "11110", "10001", "10001", "10001", "11110"],
  c: ["00000", "00000", "01111", "10000", "10000", "10000", "01111"],
  d: ["00001", "00001", "01111", "10001", "10001", "10001", "01111"],
  e: ["00000", "00000", "01110", "10001", "11111", "10000", "01110"],
  f: ["00110", "01001", "01000", "11110", "01000", "01000", "01000"],
  g: ["00000", "00000", "01111", "10001", "10001", "01111", "00001"],
  h: ["10000", "10000", "11110", "10001", "10001", "10001", "10001"],
  i: ["00000", "00100", "00000", "01100", "00100", "00100", "01110"],
  j: ["00000", "00010", "00000", "00110", "00010", "00010", "00010"],
  k: ["10000", "10000", "10010", "10100", "11000", "10100", "10010"],
  l: ["01100", "00100", "00100", "00100", "00100", "00100", "01110"],
  m: ["00000", "00000", "11010", "10101", "10101", "10101", "10101"],
  n: ["00000", "00000", "11110", "10001", "10001", "10001", "10001"],
  o: ["00000", "00000", "01110", "10001", "10001", "10001", "01110"],
  p: ["00000", "00000", "11110", "10001", "10001", "11110", "10000"],
  q: ["00000", "00000", "01111", "10001", "10001", "01111", "00001"],
  r: ["00000", "00000", "10110", "11001", "10000", "10000", "10000"],
  s: ["00000", "00000", "01111", "10000", "01110", "00001", "11110"],
  t: ["01000", "01000", "11110", "01000", "01000", "01000", "00110"],
  u: ["00000", "00000", "10001", "10001", "10001", "10011", "01101"],
  v: ["00000", "00000", "10001", "10001", "10001", "01010", "00100"],
  w: ["00000", "00000", "10001", "10101", "10101", "10101", "01010"],
  x: ["00000", "00000", "10001", "01010", "00100", "01010", "10001"],
  y: ["00000", "00000", "10001", "10001", "10001", "01111", "00001"],
  z: ["00000", "00000", "11111", "00010", "00100", "01000", "11111"],
  "0": ["01110", "10011", "10101", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  "6": ["01110", "10000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "00100", "00100", "00100"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00001", "01110"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  ".": ["00000", "00000", "00000", "00000", "00000", "00000", "01100"],
  ",": ["00000", "00000", "00000", "00000", "00000", "01100", "01000"],
  ":": ["00000", "01100", "00000", "00000", "00000", "01100", "00000"],
  ";": ["00000", "01100", "00000", "00000", "00000", "01100", "01000"],
  "!": ["00100", "00100", "00100", "00100", "00100", "00000", "00100"],
  "?": ["01110", "10001", "00001", "00010", "00100", "00000", "00100"],
  "%": ["11001", "11010", "00010", "00100", "01000", "01011", "10011"],
  $: ["00100", "01111", "10100", "01110", "00101", "11110", "00100"],
  "/": ["00001", "00001", "00010", "00100", "01000", "10000", "10000"],
  "(": ["00011", "00100", "01000", "01000", "01000", "00100", "00011"],
  ")": ["11000", "00100", "00010", "00010", "00010", "00100", "11000"],
  "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
  "\u2014": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
  "\u2013": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
  "+": ["00000", "00100", "00100", "11111", "00100", "00100", "00000"],
  "=": ["00000", "00000", "11111", "00000", "11111", "00000", "00000"],
  "&": ["01110", "10001", "10100", "01000", "10101", "10010", "01101"],
  "#": ["01010", "01010", "11111", "01010", "11111", "01010", "01010"],
  '"': ["01010", "01010", "00000", "00000", "00000", "00000", "00000"],
  "'": ["00100", "00100", "01000", "00000", "00000", "00000", "00000"],
  "\u2019": ["00100", "00100", "01000", "00000", "00000", "00000", "00000"],
  "\u2022": ["00000", "00000", "01110", "01110", "01110", "00000", "00000"],
  "\u00d7": ["00000", "00000", "10001", "01010", "00100", "01010", "10001"],
};

// Narrow glyphs get a smaller advance so body text fits its column.
const NARROW: Record<string, number> = {
  " ": 3, i: 3, l: 3, j: 3, "!": 3, ".": 3, ",": 3, ":": 3, ";": 3, "'": 3,
  "\u2019": 3, f: 4, t: 4, r: 4, "1": 4, "(": 4, ")": 4, "/": 4, '"': 4,
  "\u2022": 4,
};
const GLYPH_W = 5;
const GLYPH_H = 7;

// Advance of one glyph in font units: glyph width plus `tracking` units of
// space (default 1). Body text uses tracking 0.5 so three lines fit a
// 452 px column; headlines keep the roomier default.
function glyphAdvance(ch: string, tracking = 1): number {
  const w = ch in NARROW ? NARROW[ch] : GLYPH_W;
  return w + tracking;
}

function textWidth(text: string, scale: number, tracking = 1): number {
  let w = 0;
  for (const ch of text) w += glyphAdvance(ch, tracking);
  if (text.length > 0) w -= tracking; // no trailing gap
  return w * scale;
}

// Draw one glyph at (x, y); top-left of the 5x7 cell.
function drawGlyph(cv: Canvas, ch: string, x: number, y: number, scale: number, color: number): void {
  const g = FONT[ch];
  if (!g) return;
  for (let row = 0; row < GLYPH_H; row++) {
    for (let col = 0; col < GLYPH_W; col++) {
      if (g[row][col] === "1") {
        cv.rect(x + col * scale, y + row * scale, scale, scale, color);
      }
    }
  }
}

function drawText(
  cv: Canvas,
  text: string,
  x: number,
  y: number,
  scale: number,
  color: number,
  opts: { bold?: boolean; align?: "left" | "center"; tracking?: number } = {},
): void {
  const tracking = opts.tracking === undefined ? 1 : opts.tracking;
  let sx = x;
  if (opts.align === "center") sx = x - Math.floor(textWidth(text, scale, tracking) / 2);
  const boldOff = opts.bold ? Math.max(1, Math.round(scale / 3)) : 0;
  let cx = sx;
  for (const ch of text) {
    drawGlyph(cv, ch, Math.round(cx), y, scale, color);
    if (boldOff > 0) drawGlyph(cv, ch, Math.round(cx) + boldOff, y, scale, color);
    cx += glyphAdvance(ch, tracking) * scale;
  }
}

// Draw text along a slope: each glyph drops by `slope` pixels. A halo colour
// painted one pixel around each glyph keeps it readable over busy art.
function drawTextSlope(
  cv: Canvas,
  text: string,
  x: number,
  y: number,
  scale: number,
  color: number,
  slope: number,
  halo = 0,
): void {
  let cx = x;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const gy = y + Math.round(i * slope);
    if (halo !== 0) {
      drawGlyph(cv, ch, cx - 1, gy, scale, halo);
      drawGlyph(cv, ch, cx + 1, gy, scale, halo);
      drawGlyph(cv, ch, cx, gy - 1, scale, halo);
      drawGlyph(cv, ch, cx, gy + 1, scale, halo);
    }
    drawGlyph(cv, ch, cx, gy, scale, color);
    drawGlyph(cv, ch, cx + 1, gy, scale, color);
    cx += glyphAdvance(ch) * scale;
  }
}

function wrapText(text: string, scale: number, maxWidth: number, tracking = 1): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const trial = cur === "" ? w : cur + " " + w;
    if (textWidth(trial, scale, tracking) <= maxWidth || cur === "") {
      cur = trial;
    } else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur !== "") lines.push(cur);
  return lines;
}

function drawParagraph(
  cv: Canvas,
  text: string,
  x: number,
  y: number,
  scale: number,
  color: number,
  maxWidth: number,
  lineH: number,
): string[] {
  const lines = wrapText(text, scale, maxWidth, 0.5);
  for (let i = 0; i < lines.length; i++) {
    drawText(cv, lines[i], x, y + i * lineH, scale, color, { tracking: 0.5 });
  }
  return lines;
}

// ------------------------------------------------------------- Page layout
function drawHeader(cv: Canvas): void {
  drawText(cv, "THE WORLD TODAY", 512, 10, 10, INK, { bold: true, align: "center" });
  cv.hline(24, 1000, 90, INK, 3);
  cv.hline(24, 1000, 97, INK, 1);
  drawText(cv, "TUESDAY \u2022 17 NOVEMBER 2026", 512, 104, 6, RED, {
    bold: true,
    align: "center",
  });
}

// Main story: the Kerch / Crimea bridge, panel x 24-1000, y 160-540.
function drawMainStory(cv: Canvas): void {
  cv.outline(24, 160, 976, 380, INK, 2);
  drawText(cv, "EUROPE \u2022 WAR IN UKRAINE", 44, 172, 3, RED, { bold: true });
  drawText(cv, "UKRAINE BRINGS DOWN", 44, 200, 6, INK, { bold: true });
  drawText(cv, "CRIMEA BRIDGE", 44, 244, 6, INK, { bold: true });

  // Illustration x 44-980, y 296-452: orange-red sky, fallen steel arch,
  // bridge deck broken over blue water, smoke over the gap.
  const ix0 = 44;
  const ix1 = 980;
  const skyTop = 296;
  const waterTop = 410;
  cv.rect(ix0, skyTop, ix1 - ix0, 44, SKY1);
  cv.rect(ix0, skyTop + 44, ix1 - ix0, 44, SKY2);
  cv.rect(ix0, skyTop + 88, ix1 - ix0, 26, SKY3);
  // Low sun, pale gold.
  cv.circle(880, 322, 15, PALE);
  cv.circle(880, 322, 11, GOLD);
  // Smoke puffs rising from the broken span.
  cv.circle(622, 330, 13, SMOKE);
  cv.circle(648, 316, 16, SMOKE);
  cv.circle(600, 346, 10, SMOKE);
  cv.circle(668, 336, 9, SMOKE);
  // Standing steel arch over the intact left span.
  cv.thickLine(150, 396, 250, 332, 5, STEEL);
  cv.thickLine(250, 332, 350, 326, 5, STEEL);
  cv.thickLine(350, 326, 450, 332, 5, STEEL);
  cv.thickLine(450, 332, 550, 396, 5, STEEL);
  // Vertical hangers from arch to deck.
  for (const hx of [200, 250, 300, 350, 400, 450, 500]) {
    cv.vline(hx, 352, 396, STEEL, 2);
  }
  // Bridge deck: intact left, broken gap, intact right.
  cv.rect(ix0, 396, 516, 8, INK);
  cv.rect(700, 396, 280, 8, INK);
  // Fallen span: steel beam tilted down into the strait.
  cv.thickLine(560, 398, 640, 428, 7, STEEL);
  cv.thickLine(640, 428, 700, 446, 7, STEEL);
  cv.thickLine(560, 402, 620, 446, 4, STEEL);
  // Support pillars.
  cv.rect(180, 404, 10, 48, INK);
  cv.rect(420, 404, 10, 48, INK);
  cv.rect(820, 404, 10, 48, INK);
  cv.rect(920, 404, 10, 48, INK);
  // Water with wave marks.
  cv.rect(ix0, waterTop, ix1 - ix0, 42, WATER);
  for (const wy of [420, 432, 444]) {
    for (let wx = ix0 + 12; wx < ix1 - 30; wx += 46) {
      cv.hline(wx, wx + 26, wy, WATER_LT, 2);
    }
  }

  drawParagraph(
    cv,
    "A section of the 19-km Kerch Bridge fell into the strait overnight. Kyiv calls it the climax of a weeks-long operation; Moscow vows to rebuild.",
    44,
    464,
    3,
    INK,
    936,
    25,
  );
}

// Iran / Bahrain panel, inner x 36-488.
function drawIran(cv: Canvas): void {
  drawText(cv, "MIDDLE EAST", 36, 560, 3, RED, { bold: true });
  drawText(cv, "IRAN DRONES TARGET", 36, 586, 4, INK, { bold: true });
  drawText(cv, "US RADAR IN BAHRAIN", 36, 618, 4, INK, { bold: true });
  // Visual y 652-696: radar mast left, gulf water middle, three small
  // drones in the air, shield with a check on the right = intercepted.
  cv.hline(36, 488, 696, INK, 2);
  // Radar: mast + sweeping arcs.
  cv.vline(70, 664, 696, INK, 3);
  cv.arc(70, 664, 26, 200, 340, BLUE, 3);
  cv.arc(70, 664, 18, 200, 340, BLUE, 2);
  cv.arc(70, 664, 10, 200, 340, BLUE, 2);
  cv.line(70, 664, 92, 652, BLUE);
  cv.line(70, 664, 94, 668, BLUE);
  // Gulf water shape.
  cv.polygon(
    [
      [150, 696],
      [300, 696],
      [282, 668],
      [168, 668],
    ],
    WATER,
  );
  cv.hline(176, 288, 678, WATER_LT, 2);
  cv.hline(188, 276, 688, WATER_LT, 2);
  // Three small drones.
  for (const [dx, dy] of [
    [205, 660],
    [252, 652],
    [298, 662],
  ]) {
    cv.rect(dx - 9, dy - 3, 18, 5, INK);
    cv.hline(dx - 12, dx + 12, dy - 6, INK, 2);
    cv.hline(dx - 12, dx + 12, dy + 4, INK, 2);
    cv.px(dx, dy - 8, RED);
    cv.px(dx, dy + 6, RED);
  }
  // Shield with check mark.
  cv.polygon(
    [
      [420, 652],
      [452, 652],
      [452, 676],
      [436, 692],
      [420, 676],
    ],
    BLUE,
  );
  cv.polygon(
    [
      [424, 656],
      [448, 656],
      [448, 674],
      [436, 687],
      [424, 674],
    ],
    CREAM,
  );
  cv.thickLine(426, 670, 433, 678, 3, GREEN);
  cv.thickLine(433, 678, 446, 660, 3, GREEN);
  drawParagraph(
    cv,
    "Bahrain says the drones were intercepted. No casualties or damage reported.",
    36,
    702,
    3,
    INK,
    452,
    23,
  );
}

// Trump / Manila panel, inner x 536-988.
function drawTrump(cv: Canvas): void {
  drawText(cv, "ASIA \u2022 QUAD", 536, 560, 3, RED, { bold: true });
  drawText(cv, "TRUMP LANDS IN MANILA", 536, 586, 4, INK, { bold: true });
  drawText(cv, "FOR QUAD TALKS", 536, 618, 4, INK, { bold: true });
  // Visual y 652-696: four small flags in a row, then a landing plane.
  drawFlagUS(cv, 536, 656);
  drawFlagJP(cv, 600, 656);
  drawFlagAU(cv, 664, 656);
  drawFlagIN(cv, 728, 656);
  // Plane silhouette, nose down toward the runway line.
  cv.hline(800, 988, 694, INK, 2);
  cv.polygon(
    [
      [812, 676],
      [946, 686],
      [946, 692],
      [812, 682],
    ],
    INK,
  );
  cv.polygon(
    [
      [880, 678],
      [910, 660],
      [920, 660],
      [900, 680],
    ],
    INK,
  );
  cv.polygon(
    [
      [820, 676],
      [812, 658],
      [822, 656],
      [834, 676],
    ],
    INK,
  );
  cv.polygon(
    [
      [860, 684],
      [876, 692],
      [880, 694],
      [872, 684],
    ],
    INK,
  );
  cv.circle(848, 694, 2, INK);
  cv.circle(920, 694, 2, INK);
  drawParagraph(
    cv,
    "First Quad meeting in two years opens his Asia trip before Shenzhen.",
    536,
    702,
    3,
    INK,
    452,
    23,
  );
}

function drawFlagUS(cv: Canvas, x: number, y: number): void {
  cv.outline(x, y, 52, 26, INK, 1);
  for (let i = 0; i < 7; i++) {
    if (i % 2 === 0) cv.rect(x + 1, y + 1 + i * 4, 50, 3, RED);
  }
  cv.rect(x + 1, y + 1, 22, 13, BLUE);
  for (const [sx, sy] of [
    [4, 3],
    [12, 3],
    [4, 9],
    [12, 9],
    [8, 6],
  ]) {
    cv.px(x + sx, y + sy, WHITE);
  }
}
function drawFlagJP(cv: Canvas, x: number, y: number): void {
  cv.outline(x, y, 52, 26, INK, 1);
  cv.rect(x + 1, y + 1, 50, 24, WHITE);
  cv.circle(x + 26, y + 13, 7, RED);
}
function drawFlagAU(cv: Canvas, x: number, y: number): void {
  cv.outline(x, y, 52, 26, INK, 1);
  cv.rect(x + 1, y + 1, 50, 24, BLUE);
  cv.px(x + 8, y + 5, WHITE);
  cv.px(x + 40, y + 5, WHITE);
  cv.px(x + 44, y + 18, WHITE);
  cv.px(x + 20, y + 20, WHITE);
  cv.px(x + 30, y + 8, WHITE);
  cv.line(x + 1, y + 1, x + 20, y + 12, WHITE);
  cv.line(x + 20, y + 1, x + 1, y + 12, WHITE);
}
function drawFlagIN(cv: Canvas, x: number, y: number): void {
  cv.outline(x, y, 52, 26, INK, 1);
  cv.rect(x + 1, y + 1, 50, 8, 0xff9933);
  cv.rect(x + 1, y + 9, 50, 8, WHITE);
  cv.rect(x + 1, y + 17, 50, 8, GREEN);
  cv.ring(x + 26, y + 13, 4, BLUE, 1);
}

// Nvidia panel, inner x 36-488.
function drawNvidia(cv: Canvas): void {
  drawText(cv, "NVIDIA BOOMS \u2014 BUT", 36, 792, 4, INK, { bold: true });
  drawText(cv, "HUANG WON'T RETURN", 36, 824, 4, INK, { bold: true });
  // Visual y 858-906: green bars climbing, tallest labelled, black chip.
  const base = 904;
  const bars: Array<[number, number]> = [
    [50, 12],
    [110, 22],
    [170, 32],
    [230, 44],
  ];
  for (const [bx, bh] of bars) {
    cv.rect(bx, base - bh, 40, bh, GREEN);
    cv.rect(bx, base - bh, 40, 3, GREEN_LT);
  }
  cv.hline(36, 300, base, INK, 2);
  drawText(cv, "$115.8bn", 282, 868, 3, INK, { bold: true });
  // Black chip with gold pins.
  cv.rect(428, 862, 44, 40, INK);
  cv.rect(432, 866, 36, 32, 0x222222);
  for (let i = 0; i < 5; i++) {
    cv.rect(434 + i * 7, 858, 3, 4, GOLD);
    cv.rect(434 + i * 7, 902, 3, 4, GOLD);
  }
  drawText(cv, "NV", 436, 874, 3, GOLD, { bold: true });
  drawParagraph(
    cv,
    "Revenue $115.8bn, up 103% \u2014 but the board says no comeback for Huang.",
    36,
    912,
    3,
    INK,
    452,
    23,
  );
}

// UK sanctions panel, inner x 536-988.
function drawUK(cv: Canvas): void {
  drawText(cv, "UK SANCTIONS ISRAELI", 536, 792, 4, INK, { bold: true });
  drawText(cv, "SETTLEMENT BUILDERS", 536, 824, 4, INK, { bold: true });
  // Visual y 858-906: plain building, red diagonal SANCTIONED stamp, padlock.
  cv.rect(560, 866, 110, 38, SAND);
  cv.outline(560, 866, 110, 38, INK, 2);
  for (let wy = 872; wy <= 884; wy += 12) {
    for (let wx = 568; wx <= 648; wx += 20) {
      cv.rect(wx, wy, 10, 8, BLUE);
    }
  }
  cv.rect(606, 892, 18, 12, INK);
  // Diagonal stamp: a cream band pasted across the building, red outline,
  // red SANCTIONED text on top so it stays readable over the windows.
  cv.polygon(
    [
      [552, 878],
      [742, 866],
      [742, 896],
      [552, 908],
    ],
    CREAM,
  );
  cv.line(552, 878, 742, 866, RED);
  cv.line(742, 866, 742, 896, RED);
  cv.line(742, 896, 552, 908, RED);
  cv.line(552, 908, 552, 878, RED);
  drawTextSlope(cv, "SANCTIONED", 556, 884, 3, RED, -1.4);
  // Padlock.
  cv.arc(756, 884, 10, 180, 360, GOLD, 3);
  cv.rect(742, 884, 28, 20, GOLD);
  cv.outline(742, 884, 28, 20, INK, 1);
  cv.rect(752, 890, 8, 8, INK);
  drawParagraph(
    cv,
    "Eight firms face asset freezes over West Bank building; aid-blocking group also hit.",
    536,
    912,
    3,
    INK,
    452,
    23,
  );
}

function drawPage(cv: Canvas): void {
  drawHeader(cv);
  drawMainStory(cv);
  cv.hline(24, 1000, 548, INK, 2);
  cv.vline(512, 555, 770, INK, 2);
  drawIran(cv);
  drawTrump(cv);
  cv.hline(24, 1000, 778, INK, 2);
  cv.vline(512, 785, 985, INK, 2);
  drawNvidia(cv);
  drawUK(cv);
  cv.hline(24, 1000, 992, INK, 1);
  drawText(cv, "TUESDAY 17 NOVEMBER 2026 \u2022 Sources: Reuters, BBC, AP/NPR", 512, 998, 3, INK, {
    align: "center",
  });
}

function main(): void {
  const outDir = process.env.MAKEFUN_OUTPUT_DIR || "/output";
  fs.mkdirSync(outDir, { recursive: true });
  const cv = new Canvas();
  drawPage(cv);
  const png = encodePng(cv.buf, W, H);
  fs.writeFileSync(path.join(outDir, "entry.png"), png);
}

main();
