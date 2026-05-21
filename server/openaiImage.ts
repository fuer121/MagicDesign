import fs from "node:fs";
import path from "node:path";
import OpenAI from "openai";
import { GENERATED_DIR, OPENAI_API_KEY, OPENAI_IMAGE_MODEL } from "./config";
import { createMockImage } from "./mockImage";
import { dataUrlFromBase64, id } from "./utils";

export interface GenerateImageRequest {
  stage: string;
  prompt: string;
  inputPaths: string[];
  note?: string;
  size?: string;
}

export async function generateImageWithFallback(request: GenerateImageRequest) {
  if (!OPENAI_API_KEY) {
    const mock = await createMockImage(request);
    return { ...mock, model: OPENAI_IMAGE_MODEL, mode: "mock" as const };
  }

  const client = new OpenAI({ apiKey: OPENAI_API_KEY });
  const files = request.inputPaths
    .filter((filePath) => fs.existsSync(filePath))
    .map((filePath) => fs.createReadStream(filePath));

  try {
    const response =
      files.length > 0
        ? await client.images.edit({
            model: OPENAI_IMAGE_MODEL,
            image: files as never,
            prompt: request.prompt,
            size: request.size ?? "auto"
          } as never)
        : await client.images.generate({
            model: OPENAI_IMAGE_MODEL,
            prompt: request.prompt,
            size: request.size ?? "auto"
          } as never);

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
      dataUrl: image.b64 ? dataUrlFromBase64(image.b64) : undefined
    };
  } catch (error) {
    console.error("[openai-image] falling back to mock image:", error);
    const mock = await createMockImage({
      ...request,
      note: `OpenAI 调用失败，已生成本地 mock：${error instanceof Error ? error.message : String(error)}`
    });
    return { ...mock, model: OPENAI_IMAGE_MODEL, mode: "mock" as const };
  }
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
