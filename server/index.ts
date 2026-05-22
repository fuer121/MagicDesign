import fs from "node:fs/promises";
import path from "node:path";
import express from "express";
import cors from "cors";
import multer from "multer";
import sharp from "sharp";
import {
  EXPORT_DIR,
  GENERATED_DIR,
  MATERIAL_DIR,
  OPENAI_BASE_URL,
  OPENAI_IMAGE_BASE_URL,
  OPENAI_IMAGE_MODEL,
  OPENAI_REVIEW_MODEL,
  OPENAI_TEXT_BASE_URL,
  OPENAI_TEXT_MODEL,
  PORT,
  PROJECT_DIR,
  PROMPT_FILES,
  UPLOAD_DIR
} from "./config";
import { generateImageWithFallback } from "./openaiImage";
import { planImagePrompt } from "./promptPlanner";
import {
  addAssets,
  addNote,
  addVersion,
  confirmPeople,
  createProject,
  deleteProject,
  listProjects,
  removeAsset,
  readProject,
  updateProject
} from "./store";
import type { AssetKind, GenerationStage, PosterVersion, ProjectAsset } from "./types";
import { assetFromFile, ensureDirs, id, imageSize, nowIso, readRtfAsText, safeName } from "./utils";

await ensureDirs([UPLOAD_DIR, GENERATED_DIR, EXPORT_DIR, PROJECT_DIR]);

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use("/uploads", express.static(UPLOAD_DIR));
app.use("/generated", express.static(GENERATED_DIR));
app.use("/exports", express.static(EXPORT_DIR));
app.use("/海报素材", express.static(MATERIAL_DIR));

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${id("file")}-${safeName(file.originalname)}`)
  }),
  limits: { fileSize: 20 * 1024 * 1024, files: 12 }
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, time: nowIso() });
});

app.get("/api/bootstrap", async (_req, res, next) => {
  try {
    const projects = await listProjects();
    const prompts = {
      people: await readRtfAsText(PROMPT_FILES.people),
      background: await readRtfAsText(PROMPT_FILES.background),
      typography: await readRtfAsText(PROMPT_FILES.typography)
    };
    res.json({
      projects,
      prompts,
      sampleAssets: {
        people: [
          "/海报素材/%E6%BD%98%E9%B9%8F%E5%87%AF.jpg",
          "/海报素材/%E6%B1%AA%E7%8E%89.jpg",
          "/海报素材/%E9%99%88%E8%BE%B0.jpg",
          "/海报素材/%E9%83%AD%E6%AF%85%E5%8F%AF.jpg",
          "/海报素材/%E8%A9%B9%E9%9D%92%E4%BA%91.jpg"
        ],
        logo: "/海报素材/%E8%8A%82%E7%9B%AElogo.png",
        background: "/海报素材/%E7%A7%91%E6%8A%80%E6%84%9F%E9%A3%8E%E6%A0%BC%E5%8F%82%E8%80%83.jpg"
      },
      modelConfig: {
        imageModel: OPENAI_IMAGE_MODEL,
        textModel: OPENAI_TEXT_MODEL,
        reviewModel: OPENAI_REVIEW_MODEL,
        hasApiKey: Boolean(process.env.OPENAI_API_KEY),
        baseUrlHost: OPENAI_BASE_URL ? new URL(OPENAI_BASE_URL).host : "api.openai.com",
        imageBaseUrlHost: OPENAI_IMAGE_BASE_URL ? new URL(OPENAI_IMAGE_BASE_URL).host : "api.openai.com",
        textBaseUrlHost: OPENAI_TEXT_BASE_URL ? new URL(OPENAI_TEXT_BASE_URL).host : "api.openai.com"
      }
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/projects", async (req, res, next) => {
  try {
    const project = await createProject(req.body?.name);
    res.json(project);
  } catch (error) {
    next(error);
  }
});

app.get("/api/projects", async (_req, res, next) => {
  try {
    res.json(await listProjects());
  } catch (error) {
    next(error);
  }
});

app.get("/api/projects/:projectId", async (req, res, next) => {
  try {
    res.json(await readProject(req.params.projectId));
  } catch (error) {
    next(error);
  }
});

app.patch("/api/projects/:projectId", async (req, res, next) => {
  try {
    res.json(await updateProject(req.params.projectId, req.body));
  } catch (error) {
    next(error);
  }
});

app.delete("/api/projects/:projectId", async (req, res, next) => {
  try {
    res.json(await deleteProject(req.params.projectId));
  } catch (error) {
    next(error);
  }
});

app.post("/api/projects/:projectId/confirm-people", async (req, res, next) => {
  try {
    res.json(await confirmPeople(req.params.projectId, Boolean(req.body?.confirmed)));
  } catch (error) {
    next(error);
  }
});

app.post("/api/projects/:projectId/notes", async (req, res, next) => {
  try {
    res.json(await addNote(req.params.projectId, String(req.body?.text ?? "")));
  } catch (error) {
    next(error);
  }
});

app.post("/api/projects/:projectId/upload/:kind", upload.array("files"), async (req, res, next) => {
  try {
    const kind = req.params.kind as AssetKind;
    const files = (req.files ?? []) as Express.Multer.File[];
    const assets = await Promise.all(files.map((file) => assetFromFile(kind, file, "/uploads")));
    const projectId = String(req.params.projectId);
    const project = await addAssets(projectId, assets);
    res.json(project);
  } catch (error) {
    next(error);
  }
});

app.delete("/api/projects/:projectId/assets/:assetId", async (req, res, next) => {
  try {
    res.json(await removeAsset(req.params.projectId, req.params.assetId));
  } catch (error) {
    next(error);
  }
});

app.post("/api/projects/:projectId/import-samples", async (req, res, next) => {
  try {
    const sampleMap: Array<{ kind: AssetKind; filename: string }> = [
      { kind: "person", filename: "潘鹏凯.jpg" },
      { kind: "person", filename: "汪玉.jpg" },
      { kind: "person", filename: "陈辰.jpg" },
      { kind: "person", filename: "郭毅可.jpg" },
      { kind: "person", filename: "詹青云.jpg" },
      { kind: "background", filename: "科技感风格参考.jpg" },
      { kind: "logo", filename: "节目logo.png" }
    ];

    const assets = await Promise.all(
      sampleMap.map(async (sample) => {
        const source = path.join(MATERIAL_DIR, sample.filename);
        const filename = `${Date.now()}-${id("sample")}-${safeName(sample.filename)}`;
        const target = path.join(UPLOAD_DIR, filename);
        await fs.copyFile(source, target);
        const stats = await fs.stat(target);
        const dimensions = await imageSize(target);
        return {
          id: id("asset"),
          kind: sample.kind,
          filename,
          originalName: sample.filename,
          url: `/uploads/${encodeURIComponent(filename)}`,
          mimeType: sample.filename.endsWith(".png") ? "image/png" : "image/jpeg",
          size: stats.size,
          createdAt: nowIso(),
          ...dimensions
        };
      })
    );

    res.json(await addAssets(String(req.params.projectId), assets));
  } catch (error) {
    next(error);
  }
});

app.post("/api/projects/:projectId/generate/:stage", async (req, res, next) => {
  try {
    const project = await readProject(req.params.projectId);
    const stage = req.params.stage as GenerationStage;
    const basePrompt = await promptForStage(stage);
    const inputs = await resolveInputs(project, stage, {
      assetIds: Array.isArray(req.body?.assetIds) ? req.body.assetIds : [],
      standingTemplateUrl: typeof req.body?.standingTemplateUrl === "string" ? req.body.standingTemplateUrl : undefined
    });
    const instruction = composeInstruction(req.body?.instruction, req.body?.copy);
    const plan = await planImagePrompt({
      stage,
      basePrompt,
      instruction,
      style: project.settings.style,
      peopleCount: project.peopleCount,
      ratio: project.settings.ratio
    });
    const result = await generateImageWithFallback({
      stage,
      prompt: plan.prompt,
      inputPaths: inputs.map((input) => input.path),
      note: instruction,
      size: req.body?.size,
      allowMockFallback: inputs.length === 0
    });
    const dimensions = await imageSize(result.path);
    const version: PosterVersion = {
      id: id("version"),
      stage,
      url: result.url,
      filename: result.filename,
      prompt: plan.prompt,
      model: `${plan.model} -> ${result.model}`,
      mode: result.mode,
      createdAt: nowIso(),
      inputs: inputs.map((input) => input.url),
      note: [instruction, plan.note, result.note].filter(Boolean).join("\n"),
      errorLog: [plan.mode === "passthrough" ? plan.note : undefined, result.errorLog].filter(Boolean).join("\n") || undefined,
      ...dimensions
    };
    res.json(await addVersion(project.id, version));
  } catch (error) {
    next(error);
  }
});

app.post("/api/projects/:projectId/export", async (req, res, next) => {
  try {
    const dataUrl = String(req.body?.dataUrl ?? "");
    const ratio = String(req.body?.ratio ?? "custom");
    const match = dataUrl.match(/^data:image\/(png|jpeg|webp);base64,(.+)$/);
    if (!match) {
      res.status(400).json({ error: "Expected a base64 image dataUrl." });
      return;
    }
    const ext = match[1] === "jpeg" ? "jpg" : match[1];
    const filename = `${id(`poster-${ratio.replace(/[^a-z0-9-]/gi, "")}`)}.${ext}`;
    const outPath = path.join(EXPORT_DIR, filename);
    await fs.writeFile(outPath, Buffer.from(match[2], "base64"));
    const metadata = await sharp(outPath).metadata();
    const version: PosterVersion = {
      id: id("version"),
      stage: "canvasExport",
      url: `/exports/${encodeURIComponent(filename)}`,
      filename,
      prompt: "Deterministic Canvas typography export",
      model: "canvas",
      mode: "mock",
      createdAt: nowIso(),
      inputs: [],
      note: `导出比例 ${ratio}`,
      width: metadata.width,
      height: metadata.height
    };
    res.json(await addVersion(req.params.projectId, version));
  } catch (error) {
    next(error);
  }
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(error);
  const statusCode = typeof error === "object" && error && "statusCode" in error ? Number(error.statusCode) : 500;
  res.status(Number.isFinite(statusCode) ? statusCode : 500).json({ error: error instanceof Error ? error.message : String(error) });
});

app.listen(PORT, () => {
  console.log(`MagicDesign API listening on http://localhost:${PORT}`);
});

async function promptForStage(stage: GenerationStage) {
  const base =
    stage === "people" || stage === "peopleRevision"
      ? await readRtfAsText(PROMPT_FILES.people)
      : stage === "background" || stage === "backgroundRevision"
        ? await readRtfAsText(PROMPT_FILES.background)
        : await readRtfAsText(PROMPT_FILES.typography);
  return base;
}

function resolveInputs(
  project: Awaited<ReturnType<typeof readProject>>,
  stage: GenerationStage,
  request: { assetIds: string[]; standingTemplateUrl?: string }
) {
  const selectedAssets = selectInputs(project, stage, request);
  return Promise.all(
    selectedAssets
      .flatMap((asset) => (asset ? [asset] : []))
      .map(async (asset) => {
        const url = asset.url;
        const filename = "filename" in asset ? asset.filename : path.basename(url);
        const directory = url.startsWith("/generated")
          ? GENERATED_DIR
          : url.startsWith("/exports")
            ? EXPORT_DIR
            : url.startsWith("/standing-templates")
              ? path.join(process.cwd(), "public", "standing-templates")
              : UPLOAD_DIR;
        const resolvedPath = path.join(directory, decodeURIComponent(filename));
        await fs.access(resolvedPath);
        return { url, path: resolvedPath };
      })
  );
}

function selectInputs(
  project: Awaited<ReturnType<typeof readProject>>,
  stage: GenerationStage,
  request: { assetIds: string[]; standingTemplateUrl?: string }
) {
  const byId = new Map(project.assets.map((asset) => [asset.id, asset]));
  const requested = request.assetIds.flatMap((assetId) => {
    const asset = byId.get(assetId);
    return asset ? [asset] : [];
  });

  if (stage === "people") {
    const people = requested.filter((asset) => asset.kind === "person");
    const uploadedStanding = requested.find((asset) => asset.kind === "standing");
    const standing = uploadedStanding ?? standingTemplateAsset(request.standingTemplateUrl);
    if (people.length !== 5) {
      throw badRequest(`生成人物群像需要恰好 5 张人物定妆照，当前选择 ${people.length} 张。`);
    }
    if (!standing) throw badRequest("生成人物群像需要选择或上传一张站位线稿。");
    return [...people, standing];
  }

  if (stage === "peopleRevision") {
    const peopleBase = latestRealStageVersion(project, ["people", "peopleRevision"]);
    const people = requested.filter((asset) => asset.kind === "person");
    const uploadedStanding = requested.find((asset) => asset.kind === "standing");
    const standing = uploadedStanding ?? standingTemplateAsset(request.standingTemplateUrl);
    if (!peopleBase) throw badRequest("修改人物初稿前需要先生成一张真实模型返回的人物群像，本地 mock 不能作为修改底图。");
    return [peopleBase, ...people, ...(standing ? [standing] : [])];
  }

  if (stage === "background" || stage === "backgroundRevision") {
    const peopleBase = latestRealStageVersion(project, ["peopleRevision", "people"]);
    const backgrounds = requested.length
      ? requested.filter((asset) => asset.kind === "background")
      : project.assets.filter((asset) => asset.kind === "background");
    if (!peopleBase) throw badRequest("融合背景前需要先生成一张真实模型返回的人物群像，本地 mock 不能作为背景融合底图。");
    if (backgrounds.length === 0) throw badRequest("融合背景需要至少上传一张背景参考图。");
    return [peopleBase, ...backgrounds];
  }

  if (stage === "aiTypography") {
    const posterBase = latestRealStageVersion(project, ["background", "backgroundRevision", "peopleRevision", "people"]);
    const logos = requested.length
      ? requested.filter((asset) => asset.kind === "logo")
      : project.assets.filter((asset) => asset.kind === "logo").slice(-1);
    if (!posterBase) throw badRequest("生成最终海报前需要先有真实模型返回的人物或背景融合图，本地 mock 不能作为最终海报底图。");
    if (logos.length === 0) throw badRequest("生成最终海报需要上传节目 Logo。");
    return [posterBase, ...logos];
  }

  return [];
}

function latestStageVersion(project: Awaited<ReturnType<typeof readProject>>, stages: GenerationStage[]) {
  return project.versions.find((version) => stages.includes(version.stage));
}

function latestRealStageVersion(project: Awaited<ReturnType<typeof readProject>>, stages: GenerationStage[]) {
  return project.versions.find((version) => stages.includes(version.stage) && version.mode === "openai");
}

function standingTemplateAsset(url?: string): ProjectAsset | undefined {
  if (!url || !url.startsWith("/standing-templates/")) return undefined;
  const filename = path.basename(url);
  return {
    id: `template:${filename}`,
    kind: "standing",
    filename,
    originalName: filename,
    url,
    mimeType: filename.endsWith(".svg") ? "image/svg+xml" : "image/png",
    size: 0,
    createdAt: nowIso()
  };
}

function composeInstruction(instruction: unknown, copy: unknown) {
  const text = typeof instruction === "string" ? instruction.trim() : "";
  if (!copy || typeof copy !== "object") return text;
  const value = copy as Partial<Record<"title" | "slogan" | "meta" | "extra", string>>;
  const copyText = [
    value.title ? `标题：${value.title}` : "",
    value.slogan ? `Slogan：${value.slogan}` : "",
    value.meta ? `时间地点：${value.meta}` : "",
    value.extra ? `补充信息：${value.extra}` : ""
  ]
    .filter(Boolean)
    .join("\n");
  return [text, copyText ? `固定文案信息：\n${copyText}` : ""].filter(Boolean).join("\n\n");
}

function badRequest(message: string) {
  const error = new Error(message);
  Object.assign(error, { statusCode: 400 });
  return error;
}
