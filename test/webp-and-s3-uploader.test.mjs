import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

// 直接 import 生产实现，不再在测试里抄一份公式
import { shouldSkipCompression, calculateScaledDimensions } from '../client/src/lib/image/webp-compressor.ts';
import { getAwsV4SigningKey, sha256Hex } from '../client/src/lib/image/s3-uploader.ts';
import { extractImageUrls } from '../client/src/lib/markdown/image-extract.ts';

/** 构造一个满足 shouldSkipCompression 需要的 File */
function makeFile(name, type) {
  return new File([new Uint8Array([0])], name, { type });
}

describe('Smart WebP Compression & S3 SigV4 Architecture Suite', () => {
  it('should strictly skip GIF animated images and SVG vector images', () => {
    assert.equal(shouldSkipCompression(makeFile('animation.gif', 'image/gif')), true);
    assert.equal(shouldSkipCompression(makeFile('logo.svg', 'image/svg+xml')), true);
    // MIME 与扩展名不一致时，扩展名兜底
    assert.equal(shouldSkipCompression(makeFile('icon.svg', 'image/png')), true);
    assert.equal(shouldSkipCompression(makeFile('funny.gif', 'application/octet-stream')), true);
  });

  it('should process standard bitmap formats (PNG, JPG, BMP, WEBP)', () => {
    assert.equal(shouldSkipCompression(makeFile('screenshot.png', 'image/png')), false);
    assert.equal(shouldSkipCompression(makeFile('photo.jpg', 'image/jpeg')), false);
    assert.equal(shouldSkipCompression(makeFile('bitmap.bmp', 'image/bmp')), false);
    assert.equal(shouldSkipCompression(makeFile('optimized.webp', 'image/webp')), false);
  });

  it('should reject unknown formats (PDF 等非图片不应进入压缩管线)', () => {
    assert.equal(shouldSkipCompression(makeFile('report.pdf', 'application/pdf')), true);
    assert.equal(shouldSkipCompression(makeFile('noext', '')), true);
  });

  it('should correctly scale down images exceeding 1920px max dimension proportionally', () => {
    // 4K 横图: 3840 x 2160 -> 长边 1920
    assert.deepEqual(calculateScaledDimensions(3840, 2160, 1920), { width: 1920, height: 1080 });

    // 高清竖图: 1200 x 3840 -> 长边 1920
    assert.deepEqual(calculateScaledDimensions(1200, 3840, 1920), { width: 600, height: 1920 });

    // 小图: 800 x 600 -> 保持原样，不放大
    assert.deepEqual(calculateScaledDimensions(800, 600, 1920), { width: 800, height: 600 });

    // 边界：0 尺寸不应产生 NaN / 死循环
    assert.deepEqual(calculateScaledDimensions(0, 0, 1920), { width: 0, height: 0 });

    // 极端长条图：缩到 1px 也不能变成 0
    const strip = calculateScaledDimensions(20000, 10, 1920);
    assert.equal(strip.width, 1920);
    assert.ok(strip.height >= 1);
  });

  it('should extract both Markdown and HTML images from mixed content', () => {
    const sampleArticle = `
# 探索宇宙

这是一篇精彩的长文，包含一张宇宙大爆炸示意图：
![宇宙大爆炸](https://cdn.example.com/uploads/202610/big-bang.webp "宇宙大爆炸")

以及一张内嵌的 HTML 图谱：
<div class="gallery">
  <img src="https://cdn.example.com/uploads/202610/galaxy.webp" alt="星系群" />
  <img class="hero" src="https://cdn.example.com/uploads/202610/nebula.png" />
</div>

文末附录图：
![黑洞视界](https://pub-xxx.r2.dev/uploads/202610/black-hole.webp)
    `;
    const urls = extractImageUrls(sampleArticle);
    assert.deepEqual(
      urls.sort(),
      [
        'https://cdn.example.com/uploads/202610/big-bang.webp',
        'https://cdn.example.com/uploads/202610/galaxy.webp',
        'https://cdn.example.com/uploads/202610/nebula.png',
        'https://pub-xxx.r2.dev/uploads/202610/black-hole.webp',
      ].sort(),
    );
  });

  it('should return empty array for content without images', () => {
    assert.deepEqual(extractImageUrls(''), []);
    assert.deepEqual(extractImageUrls('纯文字，没有任何图片。'), []);
  });

  it('should accurately compute AWS Signature V4 signing key and canonical request', async () => {
    const secretKey = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';
    const dateStamp = '20261014';
    const region = 'us-east-1';
    const service = 's3';

    const signingKey = await getAwsV4SigningKey(secretKey, dateStamp, region, service);
    assert.equal(signingKey.byteLength, 32, 'HMAC-SHA256 派生密钥必须是 32 字节');

    // 与 Node 原生 crypto 的同一套派生链逐字节比对
    const hmac = (key, data) =>
      crypto.createHmac('sha256', key).update(data).digest();
    const expected = hmac(
      hmac(hmac(hmac('AWS4' + secretKey, dateStamp), region), service),
      'aws4_request',
    );
    assert.deepEqual(Buffer.from(signingKey), expected);

    const payloadHash = await sha256Hex('Hello LongPost S3 Direct Upload');
    assert.equal(payloadHash, crypto.createHash('sha256').update('Hello LongPost S3 Direct Upload').digest('hex'));

    const signature = hmac(Buffer.from(signingKey), 'string-to-sign').toString('hex');
    assert.match(signature, /^[0-9a-f]{64}$/);
  });
});
