import { z } from "zod";

export const COLUMN_NAMES = [
  "Action",
  "Email Subject",
  "ID",
  "Last edited time",
  "Owner",
  "Priority",
  "Project",
  "Status",
  "Update",
  "Update History",
] as const;

export type ColumnName = (typeof COLUMN_NAMES)[number];

export const CsvRowSchema = z.object({
  Action: z.string(),
  "Email Subject": z.string(),
  ID: z.string(),
  "Last edited time": z.string(),
  Owner: z.string(),
  Priority: z.string(),
  Project: z.string(),
  Status: z.string(),
  Update: z.string(),
  "Update History": z.string(),
});

export const TaskSchema = CsvRowSchema.extend({ _key: z.string().min(1) });
export type CsvRow = z.infer<typeof CsvRowSchema>;
export type Task = z.infer<typeof TaskSchema>;
export const TaskListSchema = z.array(TaskSchema);
