import fs from "node:fs";
import path from "node:path";
import OpenAI from "openai";
import { GENERATED_DIR, OPENAI_API_KEY, OPENAI_IMAGE_BASE_URL, OPENAI_IMAGE_MODEL } from "./config";
import { createMockImage } from "./mockImage";
import { dataUrlFromBase64, id } from "./utils";

export interface GenerateImageRequest {
  stage: string;
  prompt: string;
  inputPaths: string[];
  note?: string;
  size?: string;
}

export interface GeneratedImageResult {
  filename: string;
  path: string;
  url: string;
  width?: number;
  height?: number;
  model: string;
  mode: "openai" | "mock";
  note?: string;
  errorLog?: string;
  dataUrl?: string;
}

export async function generateImageWithFallback(request: GenerateImageRequest): Promise<GeneratedImageResult> {
  if (!OPENAI_API_KEY) {
    const mock = await createMockImage(request);
    return { ...mock, model: OPENAI_IMAGE_MODEL, mode: "mock" as const, errorLog: "OPENAI_API_KEY is not configured." };
  }

  const client = new OpenAI({ apiKey: OPENAI_API_KEY, baseURL: OPENAI_IMAGE_BASE_URL });
  const files = request.inputPaths
    .filter((filePath) => fs.existsSync(filePath))
    .map((filePath) => fs.createReadStream(filePath));

  try {
    let response;
    let degradedReason = "";
    try {
      response =
        files.length > 0
          ? await client.images.edit({
              model: OPENAI_IMAGE_MODEL,
              image: files as never,
              prompt: request.prompt,
              size: request.size ?? "1024x1536"
            } as never)
          : await client.images.generate({
              model: OPENAI_IMAGE_MODEL,
              prompt: request.prompt,
              size: request.size ?? "1024x1536"
            } as never);
    } catch (error) {
      if (!files.length || !canDegradeEditToGeneration(error)) throw error;
      degradedReason = summarizeOpenAIError(error);
      response = await client.images.generate({
        model: OPENAI_IMAGE_MODEL,
        prompt: `${request.prompt}\n\n注意：当前图片编辑接口不可用，请根据上述人物与站位要求生成一张真实节目海报风格初稿。`,
        size: request.size ?? "1024x1536"
      } as never);
    }

    const image = extractImage(response);
    if (!image) throw new Error("OpenAI image response did not include image data.");

    const filename = `${id("openai")}.png`;
    const outPath = path.join(GENERATED_DIR, filename);
    if (image.b64) {
      await fs.promises.writeFile(outPath, Buffer.from(image.b64, "base64"));
    } else if (image.url) {
      const remote = await fetch(image.url);
      if (!remote.ok) throw new Error(`Failed to fetch image URL: ${remote.status}`);
      await fs.promises.writeFile(outPath, Buffer.from(await remote.arrayBuffer()));
    }

    return {
      filename,
      path: outPath,
      url: `/generated/${encodeURIComponent(filename)}`,
      width: undefined,
      height: undefined,
      model: OPENAI_IMAGE_MODEL,
      mode: "openai" as const,
      note: degradedReason
        ? "Image edit failed; used real image generation without source-image editing."
        : undefined,
      errorLog: degradedReason ? `Image edit degraded to generation: ${degradedReason}` : undefined,
      dataUrl: image.b64 ? dataUrlFromBase64(image.b64) : undefined
    };
  } catch (error) {
    const errorLog = summarizeOpenAIError(error);
    console.error("[openai-image] falling back to mock image:", errorLog);
    const mock = await createMockImage({
      ...request,
      note: `OpenAI 调用失败，已生成本地 mock：${errorLog}`
    });
    return { ...mock, model: OPENAI_IMAGE_MODEL, mode: "mock" as const, errorLog };
  }
}

function canDegradeEditToGeneration(error: unknown) {
  const value = error as { status?: number; code?: string; message?: string; error?: { message?: string } };
  const message = [value.message, value.error?.message].filter(Boolean).join(" ");
  return (
    (value.status === 400 && /不支持模型|does not support|unsupported/i.test(message)) ||
    (value.status === 503 && /upstream|unavailable|failed/i.test(message))
  );
}

function summarizeOpenAIError(error: unknown) {
  const value = error as {
    status?: number;
    code?: string;
    type?: string;
    message?: string;
    requestID?: string | null;
    error?: { code?: string; type?: string; message?: string };
    cause?: { code?: string; message?: string };
  };
  const status = value.status ? `status=${value.status}` : undefined;
  const code = value.code || value.error?.code ? `code=${value.code || value.error?.code}` : undefined;
  const type = value.type || value.error?.type ? `type=${value.type || value.error?.type}` : undefined;
  const requestID = value.requestID ? `request_id=${value.requestID}` : undefined;
  const cause = value.cause?.code || value.cause?.message ? `cause=${[value.cause.code, value.cause.message].filter(Boolean).join(":")}` : undefined;
  const message = value.error?.message || value.message || String(error);
  return [status, code, type, requestID, cause, `message=${message}`].filter(Boolean).join(" ");
}

function extractImage(response: unknown): { b64?: string; url?: string } | null {
  const value = response as {
    data?: Array<{ b64_json?: string; url?: string }>;
    output?: Array<{ result?: string; type?: string }>;
  };

  const first = value.data?.[0];
  if (first?.b64_json) return { b64: first.b64_json };
  if (first?.url) return { url: first.url };

  const output = value.output?.find((item) => item.result);
  if (output?.result) return { b64: output.result };

  return null;
}
