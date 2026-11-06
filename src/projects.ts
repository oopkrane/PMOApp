const PROJECTS_KEY = "pmo-workspace.projects.v1";

export function loadProjects(): string[] {
  try {
    const saved: unknown = JSON.parse(
      localStorage.getItem(PROJECTS_KEY) ?? "[]",
    );
    return Array.isArray(saved)
      ? saved.filter(
          (name): name is string => typeof name === "string" && !!name.trim(),
        )
      : [];
  } catch {
    return [];
  }
}

export function saveProjects(projects: string[]): void {
  localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
}
