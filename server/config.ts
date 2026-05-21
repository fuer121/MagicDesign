import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
export const ROOT_DIR = path.resolve(path.dirname(__filename), "..");

export const PORT = Number(process.env.PORT ?? 8787);
export const OPENAI_IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2";
export const OPENAI_TEXT_MODEL = process.env.OPENAI_TEXT_MODEL ?? "gpt-5.5";
export const OPENAI_REVIEW_MODEL = process.env.OPENAI_REVIEW_MODEL ?? OPENAI_TEXT_MODEL;
export const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? "";
export const OPENAI_BASE_URL = normalizeBaseUrl(process.env.OPENAI_BASE_URL);
export const OPENAI_IMAGE_BASE_URL = normalizeBaseUrl(process.env.OPENAI_IMAGE_BASE_URL) || OPENAI_BASE_URL;
export const OPENAI_TEXT_BASE_URL = normalizeBaseUrl(process.env.OPENAI_TEXT_BASE_URL) || OPENAI_BASE_URL;

export const UPLOAD_DIR = path.join(ROOT_DIR, "uploads");
export const GENERATED_DIR = path.join(ROOT_DIR, "generated");
export const EXPORT_DIR = path.join(ROOT_DIR, "exports");
export const PROJECT_DIR = path.join(ROOT_DIR, "data", "projects");
export const MATERIAL_DIR = path.join(ROOT_DIR, "海报素材");

export const PROMPT_FILES = {
  people: path.join(ROOT_DIR, "人物站位融合 Prompt.rtf"),
  background: path.join(ROOT_DIR, "背景与初稿融合Prompt.rtf"),
  typography: path.join(ROOT_DIR, "节目 logo、文案融合 Prompt.rtf")
} as const;

function normalizeBaseUrl(value?: string) {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const url = new URL(trimmed);
  const pathname = url.pathname.replace(/\/+$/, "");
  if (!pathname || pathname === "") {
    url.pathname = "/v1";
  }
  return url.toString().replace(/\/+$/, "");
}
