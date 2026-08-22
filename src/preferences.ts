import { z } from "zod";

const VIEW_KEY = "pmo-workspace.active-view.v1";
const WorkspaceViewSchema = z.enum(["table", "board", "insights"]);

export type WorkspaceView = z.infer<typeof WorkspaceViewSchema>;

export function loadWorkspaceView(): WorkspaceView {
  const result = WorkspaceViewSchema.safeParse(
    window.localStorage.getItem(VIEW_KEY),
  );
  return result.success ? result.data : "table";
}

export function saveWorkspaceView(view: WorkspaceView): void {
  window.localStorage.setItem(VIEW_KEY, WorkspaceViewSchema.parse(view));
}
