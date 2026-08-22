import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArchiveRestore,
  ArrowDownToLine,
  CalendarDays,
  Check,
  ChevronDown,
  CircleAlert,
  CircleCheckBig,
  Columns3,
  FolderKanban,
  LayoutDashboard,
  ListFilter,
  MoreHorizontal,
  PanelLeftClose,
  Plus,
  Search,
  Settings,
  Sparkles,
  Table2,
  Trash2,
  Upload,
  Users,
  X,
} from "lucide-react";
import {
  clearSavedTasks,
  exportCsv,
  loadSeedTasks,
  parseCsv,
  saveTasks,
} from "./data";
import { COLUMN_NAMES, type ColumnName, type Task } from "./types";
import "./App.css";

type ViewMode = "table" | "board";
const completionPattern = /^(complete|completed|done|closed)$/i;

function uniqueValues(tasks: Task[], column: ColumnName): string[] {
  return [
    ...new Set(tasks.map((task) => task[column].trim()).filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b));
}

function initials(value: string): string {
  const words = value.trim().split(/\s+/).filter(Boolean);
  return words.length
    ? words
        .slice(0, 2)
        .map((word) => word[0]?.toUpperCase())
        .join("")
    : "?";
}

function statusTone(value: string): string {
  const normalized = value.toLowerCase();
  if (/complete|done|closed/.test(normalized)) return "green";
  if (/progress|active|doing/.test(normalized)) return "blue";
  if (/block|hold|risk/.test(normalized)) return "red";
  if (/review|wait|pending/.test(normalized)) return "amber";
  return "gray";
}

function priorityTone(value: string): string {
  const normalized = value.toLowerCase();
  if (/urgent|critical/.test(normalized)) return "red";
  if (/high/.test(normalized)) return "orange";
  if (/medium|normal/.test(normalized)) return "blue";
  return "gray";
}

function blankTask(index: number): Task {
  const empty = Object.fromEntries(
    COLUMN_NAMES.map((column) => [column, ""]),
  ) as Record<ColumnName, string>;
  return {
    ...empty,
    Action: "Untitled action",
    ID: `NEW-${Date.now().toString().slice(-6)}`,
    "Last edited time": new Date().toISOString(),
    _key: `new-${Date.now()}-${index}`,
  };
}

function App() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [view, setView] = useState<ViewMode>("table");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All statuses");
  const [priorityFilter, setPriorityFilter] = useState("All priorities");
  const [projectFilter, setProjectFilter] = useState("All projects");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [notice, setNotice] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadSeedTasks()
      .then(setTasks)
      .catch((reason: unknown) =>
        setError(
          reason instanceof Error ? reason.message : "Unable to load tasks.",
        ),
      )
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!loading && tasks.length > 0) saveTasks(tasks);
  }, [tasks, loading]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(""), 2800);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const projects = useMemo(() => uniqueValues(tasks, "Project"), [tasks]);
  const statuses = useMemo(() => uniqueValues(tasks, "Status"), [tasks]);
  const priorities = useMemo(() => uniqueValues(tasks, "Priority"), [tasks]);
  const filteredTasks = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return tasks.filter((task) => {
      if (projectFilter !== "All projects" && task.Project !== projectFilter)
        return false;
      if (statusFilter !== "All statuses" && task.Status !== statusFilter)
        return false;
      if (
        priorityFilter !== "All priorities" &&
        task.Priority !== priorityFilter
      )
        return false;
      return (
        !needle ||
        COLUMN_NAMES.some((column) =>
          task[column].toLowerCase().includes(needle),
        )
      );
    });
  }, [priorityFilter, projectFilter, query, statusFilter, tasks]);

  const selectedTask = tasks.find((task) => task._key === selectedKey) ?? null;
  const completed = tasks.filter((task) =>
    completionPattern.test(task.Status.trim()),
  ).length;
  const highPriority = tasks.filter((task) =>
    /high|urgent|critical/i.test(task.Priority),
  ).length;
  const unassigned = tasks.filter((task) => !task.Owner.trim()).length;

  function updateTask(key: string, column: ColumnName, value: string) {
    setTasks((current) =>
      current.map((task) =>
        task._key === key
          ? {
              ...task,
              [column]: value,
              "Last edited time": new Date().toISOString(),
            }
          : task,
      ),
    );
  }

  function addTask() {
    const task = blankTask(tasks.length);
    if (projectFilter !== "All projects") task.Project = projectFilter;
    setTasks((current) => [task, ...current]);
    setSelectedKey(task._key);
  }

  function deleteTask(key: string) {
    setTasks((current) => current.filter((task) => task._key !== key));
    setSelectedKey(null);
    setNotice("Action deleted");
  }

  function downloadCsv() {
    const blob = new Blob([exportCsv(tasks)], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "pmo-actions-export.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function importFile(file: File) {
    try {
      const imported = parseCsv(await file.text());
      setTasks(imported);
      setError("");
      setNotice(`${imported.length} actions imported`);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "The selected file could not be imported.",
      );
    }
  }

  async function restoreImport() {
    clearSavedTasks();
    setLoading(true);
    try {
      setTasks(await loadSeedTasks());
      setNotice("Original import restored");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to restore the import.",
      );
    } finally {
      setLoading(false);
    }
  }

  if (loading)
    return (
      <div className="state-page">
        <span className="loader" /> Loading workspace…
      </div>
    );
  if (error && tasks.length === 0)
    return (
      <div className="state-page error-state">
        <CircleAlert />
        <strong>Couldn’t open the workspace</strong>
        <p>{error}</p>
      </div>
    );

  return (
    <div className={`app-shell ${sidebarOpen ? "" : "sidebar-collapsed"}`}>
      <aside className="sidebar">
        <div className="workspace-switcher">
          <div className="workspace-mark">P</div>
          <div>
            <strong>PMO Workspace</strong>
            <span>Project operations</span>
          </div>
          <ChevronDown size={15} />
        </div>
        <nav className="primary-nav" aria-label="Workspace navigation">
          <button className="nav-item active">
            <LayoutDashboard size={17} /> Overview
          </button>
          <button className="nav-item">
            <CalendarDays size={17} /> Timeline{" "}
            <span className="soon">Soon</span>
          </button>
          <button className="nav-item">
            <Users size={17} /> Team
          </button>
        </nav>
        <div className="sidebar-section">
          <div className="section-label">
            <span>Projects</span>
            <Plus size={14} />
          </div>
          <button
            className={`project-link ${projectFilter === "All projects" ? "selected" : ""}`}
            onClick={() => setProjectFilter("All projects")}
          >
            <span className="project-icon all">
              <FolderKanban size={14} />
            </span>
            <span>All projects</span>
            <b>{tasks.length}</b>
          </button>
          {projects.map((project, index) => (
            <button
              className={`project-link ${projectFilter === project ? "selected" : ""}`}
              key={project}
              onClick={() => setProjectFilter(project)}
            >
              <span className={`project-icon color-${index % 5}`}>
                {project.slice(0, 1).toUpperCase()}
              </span>
              <span title={project}>{project}</span>
              <b>{tasks.filter((task) => task.Project === project).length}</b>
            </button>
          ))}
        </div>
        <div className="sidebar-footer">
          <button className="nav-item">
            <Settings size={17} /> Settings
          </button>
          <div className="profile">
            <div className="avatar">PM</div>
            <div>
              <strong>PMO Team</strong>
              <span>Local workspace</span>
            </div>
            <MoreHorizontal size={17} />
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <button
            className="icon-button"
            aria-label="Toggle sidebar"
            onClick={() => setSidebarOpen((value) => !value)}
          >
            <PanelLeftClose size={19} />
          </button>
          <div className="breadcrumbs">
            <span>Workspace</span>
            <b>/</b>
            <strong>
              {projectFilter === "All projects"
                ? "Action tracker"
                : projectFilter}
            </strong>
          </div>
          <div className="top-actions">
            <button
              className="secondary-button"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload size={16} /> Import
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void importFile(file);
                event.currentTarget.value = "";
              }}
            />
            <button className="secondary-button" onClick={downloadCsv}>
              <ArrowDownToLine size={16} /> Export
            </button>
            <button className="primary-button" onClick={addTask}>
              <Plus size={17} /> New action
            </button>
          </div>
        </header>

        <div className="page-content">
          <section className="page-heading">
            <div className="heading-icon">
              <Sparkles size={23} />
            </div>
            <div>
              <p className="eyebrow">PMO CONTROL CENTRE</p>
              <h1>
                {projectFilter === "All projects"
                  ? "Action tracker"
                  : projectFilter}
              </h1>
              <p>Plan, track and move every project action forward.</p>
            </div>
          </section>
          <section className="stats-grid" aria-label="Workspace statistics">
            <StatCard
              label="Total actions"
              value={tasks.length}
              note={`${filteredTasks.length} in current view`}
              icon={<Columns3 size={18} />}
              tone="purple"
            />
            <StatCard
              label="Completed"
              value={completed}
              note={`${tasks.length ? Math.round((completed / tasks.length) * 100) : 0}% completion rate`}
              icon={<CircleCheckBig size={18} />}
              tone="green"
            />
            <StatCard
              label="High priority"
              value={highPriority}
              note="Needs focus"
              icon={<CircleAlert size={18} />}
              tone="orange"
            />
            <StatCard
              label="Unassigned"
              value={unassigned}
              note={`${projects.length} active projects`}
              icon={<Users size={18} />}
              tone="blue"
            />
          </section>
          <section className="workspace-card">
            <div className="view-toolbar">
              <div className="view-tabs">
                <button
                  className={view === "table" ? "active" : ""}
                  onClick={() => setView("table")}
                >
                  <Table2 size={16} /> Table
                </button>
                <button
                  className={view === "board" ? "active" : ""}
                  onClick={() => setView("board")}
                >
                  <Columns3 size={16} /> Board
                </button>
              </div>
              <div className="toolbar-actions">
                <label className="search-box">
                  <Search size={16} />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search actions…"
                  />
                </label>
                <FilterSelect
                  icon={<ListFilter size={15} />}
                  value={statusFilter}
                  onChange={setStatusFilter}
                  options={["All statuses", ...statuses]}
                />
                <FilterSelect
                  value={priorityFilter}
                  onChange={setPriorityFilter}
                  options={["All priorities", ...priorities]}
                />
                <button
                  className="icon-button bordered"
                  title="Restore original imported data"
                  onClick={() => void restoreImport()}
                >
                  <ArchiveRestore size={16} />
                </button>
              </div>
            </div>
            <div className="result-bar">
              <span>
                <strong>{filteredTasks.length}</strong> actions
              </span>
              {(query ||
                statusFilter !== "All statuses" ||
                priorityFilter !== "All priorities") && (
                <button
                  onClick={() => {
                    setQuery("");
                    setStatusFilter("All statuses");
                    setPriorityFilter("All priorities");
                  }}
                >
                  Clear filters <X size={13} />
                </button>
              )}
            </div>
            {view === "table" ? (
              <TaskTable
                tasks={filteredTasks}
                onSelect={setSelectedKey}
                onUpdate={updateTask}
                statuses={statuses}
                priorities={priorities}
              />
            ) : (
              <TaskBoard
                tasks={filteredTasks}
                statuses={statuses}
                onSelect={setSelectedKey}
                onUpdate={updateTask}
              />
            )}
          </section>
        </div>
      </main>
      {selectedTask && (
        <TaskDrawer
          task={selectedTask}
          statuses={statuses}
          priorities={priorities}
          onClose={() => setSelectedKey(null)}
          onUpdate={updateTask}
          onDelete={deleteTask}
        />
      )}
      {notice && (
        <div className="toast">
          <Check size={16} /> {notice}
        </div>
      )}
      {error && tasks.length > 0 && (
        <div className="toast error-toast">
          <CircleAlert size={16} /> {error}
          <button onClick={() => setError("")}>
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  note,
  icon,
  tone,
}: {
  label: string;
  value: number;
  note: string;
  icon: ReactNode;
  tone: string;
}) {
  return (
    <article className="stat-card">
      <div className={`stat-icon ${tone}`}>{icon}</div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{note}</small>
      </div>
    </article>
  );
}

function FilterSelect({
  value,
  onChange,
  options,
  icon,
}: {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  icon?: ReactNode;
}) {
  return (
    <label className="select-wrap">
      {icon}
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
      <ChevronDown size={14} />
    </label>
  );
}

function TaskTable({
  tasks,
  onSelect,
  onUpdate,
  statuses,
  priorities,
}: {
  tasks: Task[];
  onSelect: (key: string) => void;
  onUpdate: (key: string, column: ColumnName, value: string) => void;
  statuses: string[];
  priorities: string[];
}) {
  return (
    <div className="table-scroll">
      <table className="task-table">
        <thead>
          <tr>
            {COLUMN_NAMES.map((column) => (
              <th
                key={column}
                className={column === "Action" ? "sticky-column" : ""}
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => (
            <tr key={task._key}>
              {COLUMN_NAMES.map((column) => (
                <td
                  key={column}
                  className={
                    column === "Action" ? "sticky-column action-cell" : ""
                  }
                >
                  {column === "Action" ? (
                    <button
                      className="action-title"
                      onClick={() => onSelect(task._key)}
                    >
                      <span className="doc-icon">A</span>
                      {task.Action || "Untitled action"}
                    </button>
                  ) : column === "Status" ? (
                    <select
                      className={`pill-select ${statusTone(task.Status)}`}
                      aria-label={`Status for ${task.Action}`}
                      value={task.Status}
                      onChange={(event) =>
                        onUpdate(task._key, column, event.target.value)
                      }
                    >
                      <option value="">Not set</option>
                      {statuses.map((value) => (
                        <option key={value}>{value}</option>
                      ))}
                    </select>
                  ) : column === "Priority" ? (
                    <select
                      className={`pill-select ${priorityTone(task.Priority)}`}
                      aria-label={`Priority for ${task.Action}`}
                      value={task.Priority}
                      onChange={(event) =>
                        onUpdate(task._key, column, event.target.value)
                      }
                    >
                      <option value="">Not set</option>
                      {priorities.map((value) => (
                        <option key={value}>{value}</option>
                      ))}
                    </select>
                  ) : column === "Owner" ? (
                    <div className="owner-cell">
                      <span className="mini-avatar">
                        {initials(task.Owner)}
                      </span>
                      <input
                        aria-label={`Owner for ${task.Action}`}
                        value={task.Owner}
                        onChange={(event) =>
                          onUpdate(task._key, column, event.target.value)
                        }
                      />
                    </div>
                  ) : (
                    <input
                      aria-label={`${column} for ${task.Action}`}
                      value={task[column]}
                      onChange={(event) =>
                        onUpdate(task._key, column, event.target.value)
                      }
                    />
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {tasks.length === 0 && (
        <div className="empty-state">
          <Search size={24} />
          <strong>No actions found</strong>
          <span>Try adjusting the search or filters.</span>
        </div>
      )}
    </div>
  );
}

function TaskBoard({
  tasks,
  statuses,
  onSelect,
  onUpdate,
}: {
  tasks: Task[];
  statuses: string[];
  onSelect: (key: string) => void;
  onUpdate: (key: string, column: ColumnName, value: string) => void;
}) {
  const groups = statuses.length ? statuses : ["Not set"];
  return (
    <div className="board-scroll">
      {groups.map((status) => {
        const items = tasks.filter(
          (task) => (task.Status || "Not set") === status,
        );
        return (
          <section
            className="board-column"
            key={status}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              const key = event.dataTransfer.getData("text/task-key");
              if (key)
                onUpdate(key, "Status", status === "Not set" ? "" : status);
            }}
          >
            <header>
              <span className={`status-dot ${statusTone(status)}`} />
              <strong>{status}</strong>
              <b>{items.length}</b>
              <MoreHorizontal size={16} />
            </header>
            <div className="board-list">
              {items.map((task) => (
                <article
                  className="board-card"
                  key={task._key}
                  draggable
                  onDragStart={(event) =>
                    event.dataTransfer.setData("text/task-key", task._key)
                  }
                  onClick={() => onSelect(task._key)}
                >
                  <span
                    className={`priority-label ${priorityTone(task.Priority)}`}
                  >
                    {task.Priority || "No priority"}
                  </span>
                  <h3>{task.Action || "Untitled action"}</h3>
                  {task.Project && (
                    <p>
                      <FolderKanban size={13} />
                      {task.Project}
                    </p>
                  )}
                  <footer>
                    <span className="mini-avatar">{initials(task.Owner)}</span>
                    <span>{task.Owner || "Unassigned"}</span>
                    <small>{task.ID}</small>
                  </footer>
                </article>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function TaskDrawer({
  task,
  statuses,
  priorities,
  onClose,
  onUpdate,
  onDelete,
}: {
  task: Task;
  statuses: string[];
  priorities: string[];
  onClose: () => void;
  onUpdate: (key: string, column: ColumnName, value: string) => void;
  onDelete: (key: string) => void;
}) {
  return (
    <div
      className="drawer-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside className="task-drawer" aria-label="Action details">
        <header>
          <div className="drawer-doc">A</div>
          <span>Action details</span>
          <button className="icon-button" onClick={onClose}>
            <X size={19} />
          </button>
        </header>
        <div className="drawer-body">
          <textarea
            className="title-input"
            value={task.Action}
            onChange={(event) =>
              onUpdate(task._key, "Action", event.target.value)
            }
            aria-label="Action title"
          />
          <div className="properties">
            {COLUMN_NAMES.filter((column) => column !== "Action").map(
              (column) => (
                <label className="property-row" key={column}>
                  <span>{column}</span>
                  {column === "Status" || column === "Priority" ? (
                    <select
                      value={task[column]}
                      onChange={(event) =>
                        onUpdate(task._key, column, event.target.value)
                      }
                    >
                      <option value="">Not set</option>
                      {(column === "Status" ? statuses : priorities).map(
                        (value) => (
                          <option key={value}>{value}</option>
                        ),
                      )}
                    </select>
                  ) : column === "Update" || column === "Update History" ? (
                    <textarea
                      value={task[column]}
                      onChange={(event) =>
                        onUpdate(task._key, column, event.target.value)
                      }
                    />
                  ) : (
                    <input
                      value={task[column]}
                      onChange={(event) =>
                        onUpdate(task._key, column, event.target.value)
                      }
                    />
                  )}
                </label>
              ),
            )}
          </div>
        </div>
        <footer>
          <button className="danger-button" onClick={() => onDelete(task._key)}>
            <Trash2 size={15} /> Delete action
          </button>
          <span>Changes save automatically</span>
        </footer>
      </aside>
    </div>
  );
}

export default App;
