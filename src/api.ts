import type { AssetKind, BootstrapData, GenerationStage, PosterProject } from "./types";

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    headers: options?.body instanceof FormData ? undefined : { "Content-Type": "application/json" },
    ...options
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error.error ?? response.statusText);
  }
  return response.json();
}

export const api = {
  bootstrap: () => request<BootstrapData>("/api/bootstrap"),
  createProject: (name: string) =>
    request<PosterProject>("/api/projects", { method: "POST", body: JSON.stringify({ name }) }),
  updateProject: (projectId: string, patch: Partial<PosterProject>) =>
    request<PosterProject>(`/api/projects/${projectId}`, {
      method: "PATCH",
      body: JSON.stringify(patch)
    }),
  upload: (projectId: string, kind: AssetKind, files: File[]) => {
    const form = new FormData();
    files.forEach((file) => form.append("files", file));
    return request<PosterProject>(`/api/projects/${projectId}/upload/${kind}`, {
      method: "POST",
      body: form
    });
  },
  importSamples: (projectId: string) =>
    request<PosterProject>(`/api/projects/${projectId}/import-samples`, {
      method: "POST"
    }),
  generate: (projectId: string, stage: GenerationStage, instruction?: string, assetIds?: string[], size?: string) =>
    request<PosterProject>(`/api/projects/${projectId}/generate/${stage}`, {
      method: "POST",
      body: JSON.stringify({ instruction, assetIds, size })
    }),
  confirmPeople: (projectId: string, confirmed: boolean) =>
    request<PosterProject>(`/api/projects/${projectId}/confirm-people`, {
      method: "POST",
      body: JSON.stringify({ confirmed })
    }),
  exportPoster: (projectId: string, dataUrl: string, ratio: string) =>
    request<PosterProject>(`/api/projects/${projectId}/export`, {
      method: "POST",
      body: JSON.stringify({ dataUrl, ratio })
    })
};
