/**
 * SVG -> PNG 渲染与中文字体探测。
 *
 * 单独一层是为了把 sharp 的用法集中在一处：控制器只关心"给我一张图"，
 * 不关心底层是 librsvg 还是别的什么。
 */

import sharp from 'sharp';
import { OG_HEIGHT, OG_WIDTH, fontStack } from '@server/common/utils/og-image';

/** 把 SVG 渲染成 PNG；失败时抛错，由控制器决定降级 */
export async function renderOgPng(svg: string): Promise<Buffer> {
  return sharp(Buffer.from(svg, 'utf8'), { density: 96 })
    .resize(OG_WIDTH, OG_HEIGHT, { fit: 'cover' })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/**
 * 探测宿主机有没有可用的中文字体。
 *
 * 做法：画一个"中"字，转成原始像素，数一下有多少非背景像素。
 * 没有字体时 librsvg 会画成空白或豆腐块，两种情况像素数都接近 0。
 *
 * 这不是 100% 准确的检测，但足以在启动时提醒"你的容器缺中文字体"，
 * 而不是让用户分享出去一张全方块的图。
 */
export async function detectCjkFont(): Promise<boolean> {
  try {
    const svg = [
      '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">',
      '<rect width="64" height="64" fill="#000" />',
      '<text x="8" y="52" font-size="52" fill="#fff" font-family="' + fontStack().replace(/"/g, '&quot;') + '">中</text>',
      '</svg>',
    ].join('');

    const { data } = await sharp(Buffer.from(svg, 'utf8')).raw().toBuffer({ resolveWithObject: true });

    let bright = 0;
    for (let i = 0; i < data.length; i += 1) {
      if (data[i] > 60) bright += 1;
    }
    // 一个字至少也该有上百个亮像素；个位数说明根本没画出来
    return bright > 150;
  } catch {
    return false;
  }
}
