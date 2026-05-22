import fs from "node:fs/promises";
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
  allowMockFallback?: boolean;
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
  const allowMockFallback = request.allowMockFallback ?? request.inputPaths.length === 0;

  if (!OPENAI_API_KEY) {
    if (!allowMockFallback) {
      throw imageGenerationError("图像模型未配置 OPENAI_API_KEY，无法执行真实素材融合。", 500);
    }
    const mock = await createMockImage(request);
    return { ...mock, model: OPENAI_IMAGE_MODEL, mode: "mock" as const, errorLog: "OPENAI_API_KEY is not configured." };
  }

  const client = new OpenAI({ apiKey: OPENAI_API_KEY, baseURL: OPENAI_IMAGE_BASE_URL });

  try {
    const response = await client.images.generate({
      model: OPENAI_IMAGE_MODEL,
      prompt: composeGenerationPrompt(request),
      size: request.size ?? "1024x1536"
    } as never);

    const image = extractImage(response);
    if (!image) throw new Error("OpenAI image response did not include image data.");

    const filename = `${id("openai")}.png`;
    const outPath = path.join(GENERATED_DIR, filename);
    if (image.b64) {
      await fs.writeFile(outPath, Buffer.from(image.b64, "base64"));
    } else if (image.url) {
      const remote = await fetch(image.url);
      if (!remote.ok) throw new Error(`Failed to fetch image URL: ${remote.status}`);
      await fs.writeFile(outPath, Buffer.from(await remote.arrayBuffer()));
    }

    return {
      filename,
      path: outPath,
      url: `/generated/${encodeURIComponent(filename)}`,
      width: undefined,
      height: undefined,
      model: OPENAI_IMAGE_MODEL,
      mode: "openai" as const,
      note:
        request.inputPaths.length > 0
          ? `Used /v1/images/generations endpoint. ${request.inputPaths.length} selected input image path(s) were recorded for traceability, but this endpoint does not upload image files.`
          : "Used /v1/images/generations endpoint.",
      dataUrl: image.b64 ? dataUrlFromBase64(image.b64) : undefined
    };
  } catch (error) {
    const errorLog = summarizeOpenAIError(error);
    if (!allowMockFallback) {
      console.error("[openai-image] real image request failed:", errorLog);
      throw imageGenerationError(`图像模型调用失败，未生成本地 mock：${errorLog}`, statusCodeFromOpenAIError(error));
    }

    console.error("[openai-image] falling back to mock image:", errorLog);
    const mock = await createMockImage({
      ...request,
      note: `OpenAI 调用失败，已生成本地 mock：${errorLog}`
    });
    return { ...mock, model: OPENAI_IMAGE_MODEL, mode: "mock" as const, errorLog };
  }
}

function imageGenerationError(message: string, statusCode: number) {
  const error = new Error(message);
  Object.assign(error, { statusCode });
  return error;
}

function statusCodeFromOpenAIError(error: unknown) {
  const status = Number((error as { status?: number })?.status);
  return Number.isFinite(status) && status >= 400 && status <= 599 ? status : 502;
}

function composeGenerationPrompt(request: GenerateImageRequest) {
  if (request.inputPaths.length === 0) return request.prompt;
  return [
    request.prompt,
    "系统执行说明：当前代理通道使用 /v1/images/generations 端点生成图片；用户选择的素材会作为项目 inputs 记录和业务约束，但该端点不会上传或编辑原始图片文件。请尽量按照 Prompt 中的人物数量、站位线稿、背景和 Logo 文案要求生成结果。"
  ].join("\n\n");
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
