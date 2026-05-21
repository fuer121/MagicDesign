import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import sharp from "sharp";
import type { ProjectAsset } from "./types";

const execFileAsync = promisify(execFile);

export function nowIso() {
  return new Date().toISOString();
}

export function id(prefix: string) {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

export async function ensureDirs(dirs: string[]) {
  await Promise.all(dirs.map((dir) => fs.mkdir(dir, { recursive: true })));
}

export function safeName(name: string) {
  const ext = path.extname(name);
  const base = path.basename(name, ext).replace(/[^\p{L}\p{N}._-]+/gu, "-");
  return `${base.slice(0, 60) || "asset"}${ext.toLowerCase()}`;
}

export async function imageSize(filePath: string) {
  try {
    const meta = await sharp(filePath).metadata();
    return { width: meta.width, height: meta.height };
  } catch {
    return {};
  }
}

export async function assetFromFile(
  kind: ProjectAsset["kind"],
  file: Express.Multer.File,
  publicPrefix: string
): Promise<ProjectAsset> {
  const size = await imageSize(file.path);
  return {
    id: id("asset"),
    kind,
    filename: path.basename(file.path),
    originalName: file.originalname,
    url: `${publicPrefix}/${encodeURIComponent(path.basename(file.path))}`,
    mimeType: file.mimetype,
    size: file.size,
    createdAt: nowIso(),
    ...size
  };
}

export async function readRtfAsText(filePath: string) {
  try {
    const result = await execFileAsync("textutil", ["-convert", "txt", "-stdout", filePath], {
      maxBuffer: 1024 * 1024
    });
    const text = result.stdout.trim();
    if (text) return text;
  } catch {
    // textutil is macOS-only; fall through to the small parser for other environments.
  }
  const raw = await fs.readFile(filePath, "utf8");
  return rtfToText(raw).trim();
}

function rtfToText(input: string) {
  let output = "";
  let i = 0;
  const stack: Array<{ ignorable: boolean }> = [];
  let ignorable = false;

  while (i < input.length) {
    const char = input[i];

    if (char === "{") {
      stack.push({ ignorable });
      i += 1;
      continue;
    }

    if (char === "}") {
      const state = stack.pop();
      ignorable = state?.ignorable ?? false;
      i += 1;
      continue;
    }

    if (char === "\\") {
      const next = input[i + 1];
      if (next === "*" || next === "fonttbl" || next === "colortbl") {
        ignorable = true;
        i += 2;
        continue;
      }
      if (next === "\\" || next === "{" || next === "}") {
        if (!ignorable) output += next;
        i += 2;
        continue;
      }
      if (next === "'") {
        if (!ignorable) {
          const hex = input.slice(i + 2, i + 4);
          output += Buffer.from(hex, "hex").toString("latin1");
        }
        i += 4;
        continue;
      }

      const match = input.slice(i + 1).match(/^([a-zA-Z]+)(-?\d+)? ?/);
      if (!match) {
        i += 1;
        continue;
      }
      const word = match[1];
      if (!ignorable && (word === "par" || word === "line")) output += "\n";
      if (!ignorable && word === "tab") output += "\t";
      i += 1 + match[0].length;
      continue;
    }

    if (!ignorable && char !== "\r") output += char;
    i += 1;
  }

  return output
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

export function dataUrlFromBase64(base64: string, mimeType = "image/png") {
  return `data:${mimeType};base64,${base64}`;
}
