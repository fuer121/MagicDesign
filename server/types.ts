export type GenerationStage =
  | "people"
  | "peopleRevision"
  | "background"
  | "backgroundRevision"
  | "aiTypography"
  | "canvasExport";

export type AssetKind = "person" | "standing" | "background" | "logo" | "copy" | "generated" | "export";

export interface PosterProject {
  id: string;
  name: string;
  peopleCount: number;
  confirmedPeople: boolean;
  createdAt: string;
  updatedAt: string;
  settings: PosterSettings;
  assets: ProjectAsset[];
  versions: PosterVersion[];
  notes: ProjectNote[];
}

export interface PosterSettings {
  style: string;
  ratio: string;
  customWidth?: number;
  customHeight?: number;
  model: string;
}

export interface ProjectAsset {
  id: string;
  kind: AssetKind;
  filename: string;
  originalName: string;
  url: string;
  mimeType: string;
  size: number;
  createdAt: string;
  width?: number;
  height?: number;
}

export interface PosterVersion {
  id: string;
  stage: GenerationStage;
  url: string;
  filename: string;
  prompt: string;
  model: string;
  mode: "openai" | "mock";
  createdAt: string;
  inputs: string[];
  note?: string;
  errorLog?: string;
  width?: number;
  height?: number;
}

export interface ProjectNote {
  id: string;
  text: string;
  createdAt: string;
}
