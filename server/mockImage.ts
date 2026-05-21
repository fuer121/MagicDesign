import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { GENERATED_DIR } from "./config";
import { id, nowIso } from "./utils";

export interface MockImageOptions {
  stage: string;
  inputPaths: string[];
  prompt: string;
  note?: string;
  width?: number;
  height?: number;
}

export async function createMockImage(options: MockImageOptions) {
  const width = options.width ?? 1280;
  const height = options.height ?? 1706;
  const filename = `${id("mock")}.png`;
  const outPath = path.join(GENERATED_DIR, filename);
  const base = await createBase(width, height, options.stage);
  const composites = await buildComposites(options.inputPaths, width, height, options.stage);
  const overlay = Buffer.from(`
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="${width}" height="${height}" fill="none"/>
      <text x="64" y="${height - 112}" font-family="Arial, sans-serif" font-size="28" fill="#101828" opacity="0.62">MOCK ${escapeXml(options.stage)} · ${escapeXml(nowIso())}</text>
      <text x="64" y="${height - 68}" font-family="Arial, sans-serif" font-size="24" fill="#475467" opacity="0.78">${escapeXml((options.note || "本地流程预览，设置 OPENAI_API_KEY 后调用真实图像模型").slice(0, 72))}</text>
    </svg>
  `);

  await sharp(base)
    .composite([...composites, { input: overlay, top: 0, left: 0 }])
    .png()
    .toFile(outPath);

  return { filename, path: outPath, url: `/generated/${encodeURIComponent(filename)}`, width, height };
}

async function createBase(width: number, height: number, stage: string) {
  const dark = stage.includes("background");
  const svg = `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="${dark ? "#111827" : "#ffffff"}"/>
          <stop offset="0.52" stop-color="${dark ? "#1d4ed8" : "#f3f6fb"}"/>
          <stop offset="1" stop-color="${dark ? "#0f172a" : "#e8eef7"}"/>
        </linearGradient>
        <radialGradient id="spot" cx="50%" cy="35%" r="55%">
          <stop offset="0" stop-color="${dark ? "#7dd3fc" : "#ffffff"}" stop-opacity="${dark ? "0.35" : "0.95"}"/>
          <stop offset="1" stop-color="${dark ? "#020617" : "#dbeafe"}" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#bg)"/>
      <rect width="100%" height="100%" fill="url(#spot)"/>
      <path d="M-120 ${height * 0.76} C ${width * 0.18} ${height * 0.58}, ${width * 0.72} ${height * 0.98}, ${width + 180} ${height * 0.72}" fill="none" stroke="${dark ? "#67e8f9" : "#b8c7dc"}" stroke-width="3" opacity="0.32"/>
      <path d="M${width * 0.08} ${height * 0.24} H ${width * 0.92}" stroke="${dark ? "#38bdf8" : "#d8e2ef"}" stroke-width="1.5" opacity="0.35"/>
    </svg>`;
  return Buffer.from(svg);
}

async function buildComposites(inputPaths: string[], width: number, height: number, stage: string) {
  const existing = [];
  for (const filePath of inputPaths) {
    try {
      await fs.access(filePath);
      existing.push(filePath);
    } catch {
      // Ignore missing optional inputs in mock mode.
    }
  }

  const peopleLike = existing.filter((filePath) => /\.(png|jpe?g|webp)$/i.test(filePath)).slice(0, 5);
  const composites = [];
  const figureWidth = Math.round(width * 0.22);
  const baseline = Math.round(height * 0.79);
  const positions = [
    { x: 0.09, scale: 0.9, y: 0.04 },
    { x: 0.26, scale: 1.02, y: 0.0 },
    { x: 0.43, scale: 1.12, y: -0.02 },
    { x: 0.61, scale: 1.02, y: 0.0 },
    { x: 0.78, scale: 0.9, y: 0.04 }
  ];

  for (let index = 0; index < peopleLike.length; index += 1) {
    const pos = positions[index] ?? positions[positions.length - 1];
    const input = await sharp(peopleLike[index])
      .rotate()
      .resize({ width: Math.round(figureWidth * pos.scale), fit: "inside" })
      .png()
      .toBuffer();
    const meta = await sharp(input).metadata();
    composites.push({
      input,
      left: Math.round(width * pos.x - (meta.width ?? figureWidth) / 2),
      top: Math.round(baseline - (meta.height ?? 900) + height * pos.y)
    });
  }

  if (stage.includes("background") && existing.length > 0) {
    const reference = existing[existing.length - 1];
    const strip = await sharp(reference)
      .rotate()
      .resize({ width, height: Math.round(height * 0.28), fit: "cover" })
      .modulate({ brightness: 0.85, saturation: 1.15 })
      .png()
      .toBuffer();
    composites.unshift({ input: strip, left: 0, top: 0, blend: "soft-light" as const });
  }

  return composites;
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
