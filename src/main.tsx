import React from "react";
import { createRoot } from "react-dom/client";
import {
  BadgeCheck,
  Bot,
  ChevronRight,
  Download,
  ImagePlus,
  LayoutTemplate,
  MessageSquareText,
  Palette,
  RefreshCw,
  Sparkles,
  Upload,
  UsersRound
} from "lucide-react";
import { api } from "./api";
import { PRESET_LAYOUTS, renderPoster, type PosterCopy, type PosterLayout } from "./posterCanvas";
import type { AssetKind, BootstrapData, PosterProject, PosterVersion, ProjectAsset } from "./types";
import "./styles.css";

const templates = [
  {
    id: "arc",
    name: "五人弧形主 C 位",
    description: "中心人物突出，两侧形成综艺主视觉层次。",
    url: "/standing-templates/five-people-arc.svg"
  },
  {
    id: "depth",
    name: "五人前后层次 C 位",
    description: "前后错落，适合发布会和论坛嘉宾阵容。",
    url: "/standing-templates/five-people-depth.svg"
  }
];

const defaultCopy: PosterCopy = {
  title: "未来领航者大会",
  slogan: "思想交锋，预见下一场增长",
  meta: "2026.06.18  上海 · 主会场",
  extra: "特邀嘉宾阵容 / 圆桌对谈 / 年度发布"
};

function App() {
  const [bootstrap, setBootstrap] = React.useState<BootstrapData | null>(null);
  const [project, setProject] = React.useState<PosterProject | null>(null);
  const [selectedStep, setSelectedStep] = React.useState(0);
  const [selectedTemplate, setSelectedTemplate] = React.useState(templates[0].url);
  const [instruction, setInstruction] = React.useState("");
  const [backgroundInstruction, setBackgroundInstruction] = React.useState("");
  const [copy, setCopy] = React.useState<PosterCopy>(defaultCopy);
  const [layout, setLayout] = React.useState<PosterLayout>(PRESET_LAYOUTS[0]);
  const [customWidth, setCustomWidth] = React.useState(1440);
  const [customHeight, setCustomHeight] = React.useState(1920);
  const [busy, setBusy] = React.useState("");
  const [error, setError] = React.useState("");
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  React.useEffect(() => {
    void load();
  }, []);

  React.useEffect(() => {
    if (!error || project) return;
    const retry = window.setTimeout(() => {
      void load();
    }, 1200);
    return () => window.clearTimeout(retry);
  }, [error, project]);

  React.useEffect(() => {
    const latest = latestVersion(project);
    const logo = latestLogo(project);
    if (canvasRef.current) {
      void renderPoster(canvasRef.current, latest, logo, copy, layout, project?.settings.style ?? "KV Studio");
    }
  }, [project, copy, layout]);

  async function load() {
    try {
      const data = await api.bootstrap();
      setBootstrap(data);
      if (data.projects[0]) {
        setProject(data.projects[0]);
      } else {
        setProject(await api.createProject("节目主视觉快速生成"));
      }
    } catch (err) {
      setError(messageOf(err));
    }
  }

  async function run<T>(label: string, task: () => Promise<T>, onDone?: (value: T) => void) {
    setBusy(label);
    setError("");
    try {
      const value = await task();
      onDone?.(value);
      if (isProject(value)) setProject(value);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy("");
    }
  }

  async function uploadFiles(kind: AssetKind, files: FileList | null) {
    if (!project || !files?.length) return;
    await run("上传素材中", () => api.upload(project.id, kind, Array.from(files)));
  }

  async function uploadTemplateFromUrl() {
    if (!project) return;
    const response = await fetch(selectedTemplate);
    const blob = await response.blob();
    const file = new File([blob], selectedTemplate.split("/").pop() ?? "standing.svg", { type: blob.type });
    await run("写入站位模板", () => api.upload(project.id, "standing", [file]));
  }

  async function generatePeople() {
    if (!project) return;
    await uploadTemplateFromUrl();
    await run("生成人物群像", () =>
      api.generate(project.id, "people", `${instruction}\n海报人数：5 人。站位模板：${selectedTemplate}`)
    );
    setSelectedStep(3);
  }

  async function revisePeople() {
    if (!project) return;
    await run("修改人物初稿", () => api.generate(project.id, "peopleRevision", instruction));
  }

  async function generateBackground() {
    if (!project) return;
    await run("融合背景氛围", () => api.generate(project.id, "background", backgroundInstruction));
    setSelectedStep(5);
  }

  async function exportCanvas(targetLayout = layout) {
    if (!project || !canvasRef.current) return;
    await renderPoster(
      canvasRef.current,
      latestVersion(project),
      latestLogo(project),
      copy,
      targetLayout,
      project.settings.style
    );
    const dataUrl = canvasRef.current.toDataURL("image/png");
    await run(`导出 ${targetLayout.ratio}`, () => api.exportPoster(project.id, dataUrl, targetLayout.ratio));
  }

  async function exportAllPresets() {
    for (const preset of PRESET_LAYOUTS) {
      await exportCanvas(preset);
    }
    setLayout(PRESET_LAYOUTS[0]);
  }

  if (!project || !bootstrap) {
    return (
      <main className="loading">
        <Sparkles size={28} />
        <span>正在启动 MagicDesign Studio...</span>
        {error && (
          <>
            <small>{error}</small>
            <button className="primaryButton" onClick={() => void load()}>
              重试连接
            </button>
          </>
        )}
      </main>
    );
  }

  const peopleAssets = project.assets.filter((asset) => asset.kind === "person");
  const backgroundAssets = project.assets.filter((asset) => asset.kind === "background");
  const logoAssets = project.assets.filter((asset) => asset.kind === "logo");
  const latest = latestVersion(project);
  const steps = buildSteps(project, peopleAssets, backgroundAssets, logoAssets);

  return (
    <main className="appShell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brandMark">M</div>
          <div>
            <h1>MagicDesign</h1>
            <p>活动/节目主视觉快速生成工具</p>
          </div>
        </div>

        <nav className="steps">
          {steps.map((step, index) => (
            <button
              className={`stepButton ${selectedStep === index ? "active" : ""} ${step.done ? "done" : ""}`}
              key={step.title}
              onClick={() => setSelectedStep(index)}
            >
              <span className="stepIndex">{index + 1}</span>
              <span>
                <strong>{step.title}</strong>
                <small>{step.detail}</small>
              </span>
              <ChevronRight size={16} />
            </button>
          ))}
        </nav>

        <div className="statusPanel">
          <strong>项目历史</strong>
          <span>{project.versions.length} 个版本</span>
          <span>{project.assets.length} 个素材</span>
          <span>{project.confirmedPeople ? "人物已确认" : "等待人物确认"}</span>
          <span>文本：{bootstrap.modelConfig.textModel}</span>
          <span>Review：{bootstrap.modelConfig.reviewModel}</span>
          <span>图像：{bootstrap.modelConfig.imageModel}</span>
          <span>图片接口：{bootstrap.modelConfig.imageBaseUrlHost}</span>
          <span>文本接口：{bootstrap.modelConfig.textBaseUrlHost}</span>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="caption">本机/内网 V1 · 阶段式向导</p>
            <h2>{steps[selectedStep].title}</h2>
          </div>
          <div className="topbarActions">
            <button className="ghostButton" onClick={() => void load()}>
              <RefreshCw size={16} />
              刷新
            </button>
            <button className="primaryButton" onClick={() => void exportCanvas()}>
              <Download size={16} />
              导出当前尺寸
            </button>
          </div>
        </header>

        {error && <div className="errorBar">{error}</div>}
        {busy && <div className="busyBar">{busy}...</div>}

        <div className="mainGrid">
          <section className="canvasPanel">
            <div className="posterStage">
              <canvas ref={canvasRef} aria-label="最终海报画布预览" />
            </div>
            <div className="versionStrip">
              {project.versions.slice(0, 8).map((version) => (
                <VersionThumb key={version.id} version={version} />
              ))}
              {project.versions.length === 0 && <span className="emptyHint">生成后会在这里显示历史版本。</span>}
            </div>
          </section>

          <section className="controlPanel">
            {selectedStep === 0 && (
              <Panel title="选择人数" icon={<UsersRound size={18} />}>
                <div className="numberChoice active">
                  <strong>5 人海报</strong>
                  <span>V1 固定优先支持，后续通过站位模板扩展人数。</span>
                </div>
                <TextArea
                  label="海报风格"
                  value={project.settings.style}
                  onChange={(value) =>
                    void run("保存风格", () => api.updateProject(project.id, { settings: { ...project.settings, style: value } }))
                  }
                />
              </Panel>
            )}

            {selectedStep === 1 && (
              <Panel title="选择站位线图" icon={<LayoutTemplate size={18} />}>
                <div className="templateGrid">
                  {templates.map((template) => (
                    <button
                      className={`templateCard ${selectedTemplate === template.url ? "selected" : ""}`}
                      key={template.id}
                      onClick={() => setSelectedTemplate(template.url)}
                    >
                      <img src={template.url} alt={template.name} />
                      <strong>{template.name}</strong>
                      <span>{template.description}</span>
                    </button>
                  ))}
                </div>
                <UploadBox label="上传补充站位线图" accept="image/*,.svg" onFiles={(files) => void uploadFiles("standing", files)} />
              </Panel>
            )}

            {selectedStep === 2 && (
              <Panel title="上传人物定妆照" icon={<Upload size={18} />}>
                <UploadBox label="上传 5 张人物全身定妆照" accept="image/*" multiple onFiles={(files) => void uploadFiles("person", files)} />
                <button className="ghostButton wide" disabled={Boolean(busy)} onClick={() => void run("导入示例素材", () => api.importSamples(project.id))}>
                  <ImagePlus size={16} />
                  使用目录中的示例素材
                </button>
                <AssetGrid assets={peopleAssets} />
                <button className="primaryButton wide" disabled={peopleAssets.length === 0 || Boolean(busy)} onClick={() => void generatePeople()}>
                  <Sparkles size={16} />
                  生成人物群像初稿
                </button>
              </Panel>
            )}

            {selectedStep === 3 && (
              <Panel title="确认与修改人物" icon={<BadgeCheck size={18} />}>
                <p className="helperText">海报感优先，但这里需要人工确认人物是否可用，再进入背景融合。</p>
                <TextArea label="自然语言修改" value={instruction} onChange={setInstruction} placeholder="例如：让中间人物更有主 C 位气场，两侧人物站位更紧凑。" />
                <div className="buttonRow">
                  <button className="ghostButton" disabled={!latest || Boolean(busy)} onClick={() => void revisePeople()}>
                    <MessageSquareText size={16} />
                    按描述修改
                  </button>
                  <button
                    className="primaryButton"
                    disabled={!latest || Boolean(busy)}
                    onClick={() => void run("确认人物", () => api.confirmPeople(project.id, true), setProject)}
                  >
                    <BadgeCheck size={16} />
                    人物可用
                  </button>
                </div>
              </Panel>
            )}

            {selectedStep === 4 && (
              <Panel title="融合背景氛围" icon={<ImagePlus size={18} />}>
                <UploadBox label="上传背景元素参考图" accept="image/*" multiple onFiles={(files) => void uploadFiles("background", files)} />
                <AssetGrid assets={backgroundAssets} />
                <TextArea label="背景融合要求" value={backgroundInstruction} onChange={setBackgroundInstruction} placeholder="例如：科技感蓝色舞台空间，光线统一，背景不要喧宾夺主。" />
                <button className="primaryButton wide" disabled={!project.confirmedPeople || Boolean(busy)} onClick={() => void generateBackground()}>
                  <Palette size={16} />
                  融合背景
                </button>
                {!project.confirmedPeople && <p className="warningText">需要先在上一步确认人物可用。</p>}
              </Panel>
            )}

            {selectedStep === 5 && (
              <Panel title="Logo 与文案排版" icon={<Bot size={18} />}>
                <UploadBox label="上传节目 Logo" accept="image/*" onFiles={(files) => void uploadFiles("logo", files)} />
                <AssetGrid assets={logoAssets} />
                <TextInput label="标题" value={copy.title} onChange={(value) => setCopy({ ...copy, title: value })} />
                <TextInput label="Slogan" value={copy.slogan} onChange={(value) => setCopy({ ...copy, slogan: value })} />
                <TextInput label="时间 / 地点" value={copy.meta} onChange={(value) => setCopy({ ...copy, meta: value })} />
                <TextArea label="补充信息" value={copy.extra} onChange={(value) => setCopy({ ...copy, extra: value })} />
              </Panel>
            )}

            {selectedStep === 6 && (
              <Panel title="尺寸与输出" icon={<Download size={18} />}>
                <div className="layoutGrid">
                  {PRESET_LAYOUTS.map((preset) => (
                    <button
                      className={`layoutCard ${layout.ratio === preset.ratio ? "selected" : ""}`}
                      key={preset.ratio}
                      onClick={() => setLayout(preset)}
                    >
                      <strong>{preset.ratio}</strong>
                      <span>
                        {preset.width} x {preset.height}
                      </span>
                    </button>
                  ))}
                  <button
                    className={`layoutCard ${layout.ratio === "custom" ? "selected" : ""}`}
                    onClick={() => setLayout({ ratio: "custom", width: customWidth, height: customHeight, mode: "cover" })}
                  >
                    <strong>自定义</strong>
                    <span>
                      {customWidth} x {customHeight}
                    </span>
                  </button>
                </div>
                <div className="inlineInputs">
                  <TextInput label="宽" type="number" value={String(customWidth)} onChange={(value) => setCustomWidth(Number(value) || 1)} />
                  <TextInput label="高" type="number" value={String(customHeight)} onChange={(value) => setCustomHeight(Number(value) || 1)} />
                </div>
                <button className="primaryButton wide" onClick={() => void exportAllPresets()}>
                  <Download size={16} />
                  一键导出 3 个常用尺寸
                </button>
                <button
                  className="ghostButton wide"
                  onClick={() => void run("重生成当前尺寸构图", () => api.generate(project.id, "backgroundRevision", `针对 ${layout.ratio} 尺寸重新生成构图，保持人物和风格一致。`))}
                >
                  <Sparkles size={16} />
                  高级：为当前尺寸重生成
                </button>
              </Panel>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}

function Panel({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="panel">
      <div className="panelTitle">
        {icon}
        <h3>{title}</h3>
      </div>
      {children}
    </div>
  );
}

function UploadBox({
  label,
  accept,
  multiple,
  onFiles
}: {
  label: string;
  accept: string;
  multiple?: boolean;
  onFiles: (files: FileList | null) => void;
}) {
  return (
    <label className="uploadBox">
      <Upload size={18} />
      <span>{label}</span>
      <input type="file" accept={accept} multiple={multiple} onChange={(event) => onFiles(event.currentTarget.files)} />
    </label>
  );
}

function AssetGrid({ assets }: { assets: ProjectAsset[] }) {
  if (!assets.length) return <p className="emptyHint">暂无素材。</p>;
  return (
    <div className="assetGrid">
      {assets.map((asset) => (
        <figure key={asset.id}>
          <img src={asset.url} alt={asset.originalName} />
          <figcaption>{asset.originalName}</figcaption>
        </figure>
      ))}
    </div>
  );
}

function VersionThumb({ version }: { version: PosterVersion }) {
  return (
    <figure className="versionThumb">
      <img src={version.url} alt={version.stage} />
      <figcaption>
        <strong>{stageLabel(version.stage)}</strong>
        <span className={version.errorLog ? "modeWithWarning" : ""}>{version.mode}</span>
        {version.errorLog && (
          <details>
            <summary>日志</summary>
            <p>{version.errorLog}</p>
          </details>
        )}
      </figcaption>
    </figure>
  );
}

function TextInput({
  label,
  value,
  type = "text",
  onChange
}: {
  label: string;
  value: string;
  type?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type={type} value={value} onChange={(event) => onChange(event.currentTarget.value)} />
    </label>
  );
}

function TextArea({
  label,
  value,
  placeholder,
  onChange
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <textarea value={value} placeholder={placeholder} onChange={(event) => onChange(event.currentTarget.value)} />
    </label>
  );
}

function buildSteps(project: PosterProject, people: ProjectAsset[], background: ProjectAsset[], logo: ProjectAsset[]) {
  return [
    { title: "选择人数", detail: "V1 固定 5 人", done: project.peopleCount === 5 },
    { title: "站位线图", detail: "2 个内置模板", done: project.assets.some((asset) => asset.kind === "standing") },
    { title: "人物定妆照", detail: `${people.length} 张已上传`, done: people.length >= 5 },
    { title: "人物初稿确认", detail: project.confirmedPeople ? "已确认" : "需人工确认", done: project.confirmedPeople },
    { title: "背景融合", detail: `${background.length} 张参考图`, done: project.versions.some((version) => version.stage === "background") },
    { title: "Logo 文案", detail: `${logo.length} 个 Logo`, done: logo.length > 0 },
    { title: "尺寸输出", detail: "3:4 / 9:16 / 2:3 / 自定义", done: project.versions.some((version) => version.url.startsWith("/exports")) }
  ];
}

function latestVersion(project: PosterProject | null) {
  return project?.versions.find((version) => version.url.startsWith("/generated") || version.url.startsWith("/exports"));
}

function latestLogo(project: PosterProject | null) {
  return project?.assets.filter((asset) => asset.kind === "logo").at(-1);
}

function stageLabel(stage: string) {
  const labels: Record<string, string> = {
    people: "人物融合",
    peopleRevision: "人物修改",
    background: "背景融合",
    backgroundRevision: "尺寸重生成",
    aiTypography: "导出"
  };
  return labels[stage] ?? stage;
}

function isProject(value: unknown): value is PosterProject {
  return Boolean(value && typeof value === "object" && "id" in value && "versions" in value);
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

createRoot(document.getElementById("root")!).render(<App />);
