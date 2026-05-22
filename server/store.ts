import fs from "node:fs/promises";
import path from "node:path";
import { OPENAI_IMAGE_MODEL, PROJECT_DIR } from "./config";
import type { PosterProject, PosterVersion, ProjectAsset, ProjectNote } from "./types";
import { id, nowIso } from "./utils";

export async function createProject(name = "未命名主视觉项目") {
  const project: PosterProject = {
    id: id("project"),
    name,
    peopleCount: 5,
    confirmedPeople: false,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    settings: {
      style: "高级节目主视觉 / 科技感商业 KV",
      ratio: "3:4",
      model: OPENAI_IMAGE_MODEL
    },
    assets: [],
    versions: [],
    notes: []
  };
  await saveProject(project);
  return project;
}

export async function listProjects() {
  const files = await fs.readdir(PROJECT_DIR).catch(() => []);
  const projects = await Promise.all(
    files
      .filter((file) => file.endsWith(".json"))
      .map((file) => readProject(file.replace(/\.json$/, "")))
  );
  return projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function readProject(projectId: string) {
  const file = path.join(PROJECT_DIR, `${projectId}.json`);
  const content = await fs.readFile(file, "utf8");
  return JSON.parse(content) as PosterProject;
}

export async function saveProject(project: PosterProject) {
  project.updatedAt = nowIso();
  const file = path.join(PROJECT_DIR, `${project.id}.json`);
  await fs.writeFile(file, `${JSON.stringify(project, null, 2)}\n`, "utf8");
}

export async function updateProject(projectId: string, patch: Partial<PosterProject>) {
  const project = await readProject(projectId);
  const next = { ...project, ...patch, settings: { ...project.settings, ...patch.settings } };
  await saveProject(next);
  return next;
}

export async function deleteProject(projectId: string) {
  const file = path.join(PROJECT_DIR, `${projectId}.json`);
  await fs.rm(file, { force: true });
  return { ok: true, projectId };
}

export async function addAssets(projectId: string, assets: ProjectAsset[]) {
  const project = await readProject(projectId);
  project.assets.push(...assets);
  await saveProject(project);
  return project;
}

export async function removeAsset(projectId: string, assetId: string) {
  const project = await readProject(projectId);
  project.assets = project.assets.filter((asset) => asset.id !== assetId);
  await saveProject(project);
  return project;
}

export async function addVersion(projectId: string, version: PosterVersion) {
  const project = await readProject(projectId);
  project.versions.unshift(version);
  await saveProject(project);
  return project;
}

export async function confirmPeople(projectId: string, confirmedPeople: boolean) {
  const project = await readProject(projectId);
  project.confirmedPeople = confirmedPeople;
  await saveProject(project);
  return project;
}

export async function addNote(projectId: string, text: string) {
  const project = await readProject(projectId);
  const note: ProjectNote = { id: id("note"), text, createdAt: nowIso() };
  project.notes.unshift(note);
  await saveProject(project);
  return project;
}
