/**
 * 生成应用图标 desktop/resources/icon.png（256×256）。
 *
 * 不依赖任何图形库，直接按像素画好再用 zlib 压成 PNG，
 * 这样换电脑 / 换 CI 都能一条命令重新生成，不会出现「图标丢了」。
 *
 *   node scripts/make-icon.js
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const SIZE = 256;

// ---------------------------------------------------------------- PNG 写入

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------- 画图

const buf = Buffer.alloc(SIZE * SIZE * 4);

function put(x, y, r, g, b, a) {
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;
  const i = (y * SIZE + x) * 4;
  const sa = a / 255;
  const da = buf[i + 3] / 255;
  const outA = sa + da * (1 - sa);
  if (outA === 0) {
    buf[i] = 0;
    buf[i + 1] = 0;
    buf[i + 2] = 0;
    buf[i + 3] = 0;
    return;
  }
  buf[i] = Math.round((r * sa + buf[i] * da * (1 - sa)) / outA);
  buf[i + 1] = Math.round((g * sa + buf[i + 1] * da * (1 - sa)) / outA);
  buf[i + 2] = Math.round((b * sa + buf[i + 2] * da * (1 - sa)) / outA);
  buf[i + 3] = Math.round(outA * 255);
}

/** 抗锯齿圆角矩形：距边缘 1px 内做柔和过渡。 */
function roundRect(x0, y0, x1, y1, radius, colourAt) {
  for (let y = Math.floor(y0) - 3; y <= Math.ceil(y1) + 3; y += 1) {
    for (let x = Math.floor(x0) - 3; x <= Math.ceil(x1) + 3; x += 1) {
      const d = roundedDistance(x + 0.5, y + 0.5, x0, y0, x1, y1, radius);
      const alpha = Math.max(0, Math.min(1, 0.5 - d));
      if (alpha <= 0) continue;
      const c = colourAt(x, y);
      put(x, y, c[0], c[1], c[2], Math.round(alpha * (c[3] == null ? 255 : c[3])));
    }
  }
}

/**
 * 圆角矩形有符号距离场：内部为负、边界为 0、外部为正。
 * 必须用这个算法 —— 之前按「轴向距离」算，矩形内部会被判成 0，整片变成 50% 半透明，
 * 结果圆角外面冒出一圈奇怪的色块。
 */
function roundedDistance(px, py, x0, y0, x1, y1, radius) {
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const hw = Math.max(0, (x1 - x0) / 2 - radius);
  const hh = Math.max(0, (y1 - y0) / 2 - radius);
  const qx = Math.abs(px - cx) - hw;
  const qy = Math.abs(py - cy) - hh;
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  const inside = Math.min(Math.max(qx, qy), 0);
  return outside + inside - radius;
}

const lerp = (a, b, t) => a + (b - a) * t;

// 1. 背景：蓝 -> 绿 的对角渐变圆角方块
roundRect(8, 8, 248, 248, 56, (x, y) => {
  const t = Math.min(1, Math.max(0, (x + y) / (SIZE * 1.6)));
  return [
    Math.round(lerp(59, 34, t)),
    Math.round(lerp(130, 197, t)),
    Math.round(lerp(246, 94, t)),
    255,
  ];
});

// 2. 白色纸张
roundRect(76, 54, 180, 202, 14, () => [255, 255, 255, 255]);

// 3. 纸上的文字线
const LINE_COLOR = [120, 138, 160, 255];
const lines = [
  [96, 160, 92],
  [96, 160, 112],
  [96, 160, 132],
  [96, 142, 152],
];
for (const [lx0, lx1, ly] of lines) {
  roundRect(lx0, ly, lx1, ly + 7, 3.5, () => LINE_COLOR);
}

// 4. 纸张右下角补一条绿色小柱，暗示「图表」
roundRect(96, 168, 116, 186, 3, () => [59, 130, 246, 255]);
roundRect(124, 160, 144, 186, 3, () => [34, 197, 94, 255]);

const outPath = path.join(__dirname, '..', 'resources', 'icon.png');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, encodePng(SIZE, SIZE, buf));
console.log('icon written:', outPath, fs.statSync(outPath).size, 'bytes');
