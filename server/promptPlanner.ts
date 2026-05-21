import OpenAI from "openai";
import { OPENAI_API_KEY, OPENAI_TEXT_BASE_URL, OPENAI_TEXT_MODEL } from "./config";
import type { GenerationStage } from "./types";

export interface PromptPlanRequest {
  stage: GenerationStage;
  basePrompt: string;
  instruction?: string;
  style?: string;
  peopleCount?: number;
  ratio?: string;
}

export interface PromptPlan {
  prompt: string;
  model: string;
  mode: "openai" | "passthrough";
  note?: string;
}

export async function planImagePrompt(request: PromptPlanRequest): Promise<PromptPlan> {
  const fallback = composeFallbackPrompt(request);
  if (!OPENAI_API_KEY) {
    return {
      prompt: fallback,
      model: "local-prompt",
      mode: "passthrough",
      note: "OPENAI_API_KEY is not configured; using the local prompt directly."
    };
  }

  const client = new OpenAI({ apiKey: OPENAI_API_KEY, baseURL: OPENAI_TEXT_BASE_URL });
  try {
    const response = await client.responses.create({
      model: OPENAI_TEXT_MODEL,
      instructions:
        "你是资深节目主视觉 AI 制片和 Prompt Director。你的任务是把业务侧中文需求整理成可直接给图像模型使用的高质量中文 Prompt。保持原始约束，不要发散新需求，不要输出解释。",
      input: [
        `阶段：${stageLabel(request.stage)}`,
        `人数：${request.peopleCount ?? 5}`,
        `目标比例：${request.ratio ?? "未指定"}`,
        `风格：${request.style ?? "高级节目主视觉 / 商业 KV"}`,
        "基础 Prompt：",
        request.basePrompt,
        request.instruction ? `用户补充要求：\n${request.instruction}` : "",
        "请输出一段最终图像生成 Prompt，包含构图、人物、背景、光线、保真边界和禁止事项。只输出 Prompt 正文。"
      ]
        .filter(Boolean)
        .join("\n\n"),
      max_output_tokens: 1200
    });

    const text = response.output_text?.trim();
    return {
      prompt: text || fallback,
      model: OPENAI_TEXT_MODEL,
      mode: "openai",
      note: text ? undefined : "GPT text model returned empty output; used fallback prompt."
    };
  } catch (error) {
    console.error("[prompt-planner] using fallback prompt:", error);
    return {
      prompt: fallback,
      model: OPENAI_TEXT_MODEL,
      mode: "passthrough",
      note: `Text model failed; used fallback prompt: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

function composeFallbackPrompt(request: PromptPlanRequest) {
  return [
    request.basePrompt,
    `\n当前海报风格：${request.style ?? "高级节目主视觉 / 商业 KV"}`,
    `海报人数：${request.peopleCount ?? 5}`,
    request.ratio ? `目标比例：${request.ratio}` : "",
    request.instruction ? `用户自然语言修改要求：\n${request.instruction}` : ""
  ]
    .filter(Boolean)
    .join("\n\n");
}

function stageLabel(stage: GenerationStage) {
  const labels: Record<GenerationStage, string> = {
    people: "人物站位融合",
    peopleRevision: "人物自然语言修改",
    background: "背景与初稿融合",
    backgroundRevision: "按尺寸重新生成背景构图",
    aiTypography: "Logo 与文案融合"
  };
  return labels[stage];
}
