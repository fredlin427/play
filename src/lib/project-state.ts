/**
 * Project State Interface
 *
 * Tracks the entire lifecycle of a 2D→3D generation project.
 */

// ── Workflow Status ────────────────────────────────────────────────

export type WorkflowStatus =
  | "draft"
  | "prompt_crafting"
  | "image_generating"
  | "image_review"
  | "model_generating"
  | "model_review"
  | "blender_processing"
  | "engineer_review"
  | "stl_ready"
  | "completed";

export const WORKFLOW_STEPS = [
  { step: 0, key: "describe", status: "prompt_crafting" as WorkflowStatus },
  { step: 1, key: "craft_prompt", status: "prompt_crafting" as WorkflowStatus },
  { step: 2, key: "generate_image", status: "image_generating" as WorkflowStatus },
  { step: 3, key: "review_image", status: "image_review" as WorkflowStatus },
  { step: 4, key: "generate_3d", status: "model_generating" as WorkflowStatus },
  { step: 5, key: "review_model", status: "model_review" as WorkflowStatus },
  { step: 6, key: "blender_process", status: "blender_processing" as WorkflowStatus },
  { step: 7, key: "engineer_review", status: "engineer_review" as WorkflowStatus },
  { step: 8, key: "export_stl", status: "stl_ready" as WorkflowStatus },
];

// ── Record Types ───────────────────────────────────────────────────

export interface PromptVersionRecord {
  id: string;
  projectId: string;
  version: number;
  userInput: string;
  craftedPrompt: string;
  negativePrompt: string;
  styleNotes: string;
  sketchData: string;
  isApproved: boolean;
  feedback: string;
  clarityScore: number;
  createdAt: string;
}

export interface ReferenceImageRecord {
  id: string;
  projectId: string;
  imageUrl: string;
  thumbnailUrl: string;
  width: number;
  height: number;
  fileSize: number;
  analysis: string;
  createdAt: string;
}

export interface ReferenceModelRecord {
  id: string;
  projectId: string;
  fileUrl: string;
  fileFormat: string;
  fileSize: number;
  thumbnailUrl: string;
  analysis: string;
  createdAt: string;
}

export interface GeneratedImageRecord {
  id: string;
  projectId: string;
  promptVersionId: string;
  imageUrl: string;
  thumbnailUrl: string;
  width: number;
  height: number;
  fileSize: number;
  isApproved: boolean;
  createdAt: string;
}

export interface GeneratedModelRecord {
  id: string;
  projectId: string;
  sourceImageId: string;
  modelUrl: string;
  modelFormat: string;
  fileSize: number;
  thumbnailUrl: string;
  createdAt: string;
}

export interface BlenderJobRecord {
  id: string;
  projectId: string;
  sourceModelId: string;
  jobType: string;
  status: string;
  progress: number;
  outputStlUrl: string;
  outputStlSize: number;
  checks: string;
  warnings: string;
  logOutput: string;
  errorMessage: string;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

// ── Project State ──────────────────────────────────────────────────

export interface ProjectState {
  projectId: string;
  title: string;
  description: string;
  status: WorkflowStatus;
  currentStep: number;
  messages: Array<{ role: string; content: string; createdAt: string }>;
  promptVersions: PromptVersionRecord[];
  currentPromptVersion: number;
  referenceImages: ReferenceImageRecord[];
  referenceModels: ReferenceModelRecord[];
  images: GeneratedImageRecord[];
  approvedImageId: string | null;
  models: GeneratedModelRecord[];
  currentModelId: string | null;
  blenderJobs: BlenderJobRecord[];
  currentBlenderJobId: string | null;
  stlFileUrl: string | null;
}
