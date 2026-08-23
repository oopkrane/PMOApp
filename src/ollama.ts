import { z } from "zod";

export const DEFAULT_OLLAMA_MODEL = "qwen3.5:9b";
const MODEL_STORAGE_KEY = "pmo-workspace.ollama-model.v1";

export const OllamaModelNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .regex(
    /^[a-zA-Z0-9._:/-]+$/,
    "The Ollama model name contains unsupported characters.",
  );

const OllamaTagsSchema = z.object({
  models: z.array(
    z.object({
      name: OllamaModelNameSchema,
      size: z.number().nonnegative().optional(),
      modified_at: z.string().optional(),
      details: z
        .object({
          family: z.string().optional(),
          parameter_size: z.string().optional(),
          quantization_level: z.string().optional(),
        })
        .optional(),
    }),
  ),
});

export interface InstalledOllamaModel {
  name: string;
  size?: number;
  modifiedAt?: string;
  family?: string;
  parameterSize?: string;
  quantization?: string;
}

export function loadOllamaModel(): string {
  const result = OllamaModelNameSchema.safeParse(
    window.localStorage.getItem(MODEL_STORAGE_KEY),
  );
  return result.success ? result.data : DEFAULT_OLLAMA_MODEL;
}

export function saveOllamaModel(model: string): string {
  const validated = OllamaModelNameSchema.parse(model);
  window.localStorage.setItem(MODEL_STORAGE_KEY, validated);
  return validated;
}

export async function scanInstalledOllamaModels(): Promise<
  InstalledOllamaModel[]
> {
  const response = await fetch("/api/ollama/api/tags");
  if (!response.ok) {
    throw new Error(
      response.status === 502
        ? "Ollama is not reachable. Start Ollama and scan again."
        : `Ollama model scan failed (${response.status}).`,
    );
  }
  const result = OllamaTagsSchema.parse(await response.json());
  return result.models
    .map((model) => ({
      name: model.name,
      size: model.size,
      modifiedAt: model.modified_at,
      family: model.details?.family,
      parameterSize: model.details?.parameter_size,
      quantization: model.details?.quantization_level,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}
