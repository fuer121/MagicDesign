import type { ProjectAsset, PosterVersion } from "./types";

export interface PosterCopy {
  title: string;
  slogan: string;
  meta: string;
  extra: string;
}

export interface PosterLayout {
  ratio: string;
  width: number;
  height: number;
  mode: "fit" | "cover";
}

export const PRESET_LAYOUTS: PosterLayout[] = [
  { ratio: "3:4", width: 1440, height: 1920, mode: "cover" },
  { ratio: "9:16", width: 1080, height: 1920, mode: "cover" },
  { ratio: "2:3", width: 1200, height: 1800, mode: "cover" }
];

export async function renderPoster(
  canvas: HTMLCanvasElement,
  baseVersion: PosterVersion | undefined,
  logo: ProjectAsset | undefined,
  copy: PosterCopy,
  layout: PosterLayout,
  style: string
) {
  const scale = Math.min(1, 900 / layout.height);
  canvas.width = layout.width;
  canvas.height = layout.height;
  canvas.style.aspectRatio = `${layout.width} / ${layout.height}`;
  canvas.style.width = `${Math.round(layout.width * scale)}px`;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.clearRect(0, 0, layout.width, layout.height);
  await drawBackground(ctx, layout, baseVersion?.url);
  await drawLogo(ctx, layout, logo?.url);
  drawCopy(ctx, layout, copy, style);
  drawSafeMark(ctx, layout);
}

async function drawBackground(ctx: CanvasRenderingContext2D, layout: PosterLayout, url?: string) {
  const { width, height } = layout;
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#111827");
  gradient.addColorStop(0.45, "#1d4ed8");
  gradient.addColorStop(1, "#020617");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  if (!url) {
    ctx.fillStyle = "rgba(255,255,255,0.82)";
    ctx.font = "600 42px Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("等待生成海报底图", width / 2, height / 2);
    return;
  }

  const image = await loadImage(url);
  const sourceRatio = image.width / image.height;
  const targetRatio = width / height;
  let drawWidth = width;
  let drawHeight = height;
  if (sourceRatio > targetRatio) {
    drawHeight = height;
    drawWidth = height * sourceRatio;
  } else {
    drawWidth = width;
    drawHeight = width / sourceRatio;
  }
  ctx.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
  const shade = ctx.createLinearGradient(0, 0, 0, height);
  shade.addColorStop(0, "rgba(2,6,23,0.12)");
  shade.addColorStop(0.68, "rgba(2,6,23,0.08)");
  shade.addColorStop(1, "rgba(2,6,23,0.54)");
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, width, height);
}

async function drawLogo(ctx: CanvasRenderingContext2D, layout: PosterLayout, url?: string) {
  if (!url) return;
  const image = await loadImage(url);
  const maxWidth = layout.width * 0.24;
  const maxHeight = layout.height * 0.1;
  const scale = Math.min(maxWidth / image.width, maxHeight / image.height);
  const logoWidth = image.width * scale;
  const logoHeight = image.height * scale;
  ctx.drawImage(image, layout.width * 0.075, layout.height * 0.055, logoWidth, logoHeight);
}

function drawCopy(ctx: CanvasRenderingContext2D, layout: PosterLayout, copy: PosterCopy, style: string) {
  const left = layout.width * 0.075;
  const bottom = layout.height * 0.1;
  const titleSize = Math.max(54, Math.min(112, layout.width * 0.085));
  const sloganSize = Math.max(28, titleSize * 0.34);
  const metaSize = Math.max(24, titleSize * 0.25);

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.shadowColor = "rgba(0,0,0,0.32)";
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 8;

  ctx.fillStyle = "#ffffff";
  ctx.font = `800 ${titleSize}px "PingFang SC", "Microsoft YaHei", Arial, sans-serif`;
  wrapText(ctx, copy.title || "未来领航者大会", left, bottom - titleSize * 1.6, layout.width * 0.76, titleSize * 1.08);

  ctx.shadowBlur = 10;
  ctx.font = `500 ${sloganSize}px "PingFang SC", "Microsoft YaHei", Arial, sans-serif`;
  ctx.fillStyle = "rgba(255,255,255,0.88)";
  wrapText(ctx, copy.slogan || "思想交锋，预见下一场增长", left, bottom - sloganSize * 1.1, layout.width * 0.72, sloganSize * 1.32);

  ctx.shadowBlur = 0;
  ctx.font = `600 ${metaSize}px "PingFang SC", "Microsoft YaHei", Arial, sans-serif`;
  ctx.fillStyle = "rgba(255,255,255,0.82)";
  wrapText(ctx, copy.meta || "2026.06.18  上海 · 主会场", left, bottom + metaSize * 0.6, layout.width * 0.7, metaSize * 1.28);

  if (copy.extra) {
    ctx.font = `500 ${Math.round(metaSize * 0.82)}px "PingFang SC", "Microsoft YaHei", Arial, sans-serif`;
    ctx.fillStyle = "rgba(255,255,255,0.68)";
    wrapText(ctx, copy.extra, left, bottom + metaSize * 2.05, layout.width * 0.7, metaSize * 1.12);
  }

  ctx.font = `500 ${Math.round(metaSize * 0.74)}px Arial, sans-serif`;
  ctx.fillStyle = "rgba(255,255,255,0.52)";
  ctx.textAlign = "right";
  ctx.fillText(style, layout.width * 0.925, layout.height * 0.065);
}

function drawSafeMark(ctx: CanvasRenderingContext2D, layout: PosterLayout) {
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = 2;
  ctx.setLineDash([12, 18]);
  const pad = Math.round(Math.min(layout.width, layout.height) * 0.055);
  ctx.strokeRect(pad, pad, layout.width - pad * 2, layout.height - pad * 2);
  ctx.restore();
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number
) {
  const chars = Array.from(text);
  let line = "";
  let cursorY = y;
  for (const char of chars) {
    const next = line + char;
    if (ctx.measureText(next).width > maxWidth && line) {
      ctx.fillText(line, x, cursorY);
      line = char;
      cursorY += lineHeight;
    } else {
      line = next;
    }
  }
  if (line) ctx.fillText(line, x, cursorY);
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = url;
  });
}
