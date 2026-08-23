import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArchiveRestore,
  ArrowDownToLine,
  BrainCircuit,
  CalendarDays,
  Check,
  ChevronDown,
  CircleAlert,
  CircleCheckBig,
  Columns3,
  FolderKanban,
  LayoutDashboard,
  ListFilter,
  MailCheck,
  MoreHorizontal,
  PanelLeftClose,
  Plus,
  RefreshCw,
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
  requestPersistentTaskStorage,
  saveTasks,
} from "./data";
import { nextSequentialId } from "./ids";
import { matchEmailToAction } from "./emailMatcher";
import {
  authorizeGmail,
  disconnectGmail,
  confirmGmailAccount,
  findUnreadProjectEmails,
  markEmailRead,
} from "./gmail";
import {
  GmailConfigSchema,
  clearGmailConfig,
  loadGmailConfig,
  saveGmailConfig,
  type GmailConfig,
} from "./gmailConfig";
import {
  generateProjectInsights,
  loadSavedInsights,
  saveInsights,
  type AiInsightResult,
} from "./insights";
import {
  loadOllamaModel,
  saveOllamaModel,
  scanInstalledOllamaModels,
  type InstalledOllamaModel,
} from "./ollama";
import { loadWorkspaceView, saveWorkspaceView } from "./preferences";
import {
  askProjectActions,
  type ProjectChatAnswer,
  type ProjectChatHistoryItem,
  type ProjectChatReference,
} from "./projectChat";
import {
  COLUMN_NAMES,
  DISPLAY_COLUMNS,
  columnLabel,
  type ColumnName,
  type Task,
} from "./types";
import { applyTaskUpdate } from "./updates";
import "./App.css";

const completionPattern = /^(complete|completed|done|closed)$/i;

interface ProjectChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  confidence?: ProjectChatAnswer["confidence"];
  references?: ProjectChatReference[];
}

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

function blankTask(id: string, key: string): Task {
  const empty = Object.fromEntries(
    COLUMN_NAMES.map((column) => [column, ""]),
  ) as Record<ColumnName, string>;
  return {
    ...empty,
    Action: "Untitled action",
    ID: id,
    "Last edited time": new Date().toISOString(),
    _key: key,
  };
}

function App() {
  const [initialInsights] = useState(loadSavedInsights);
  const [page, setPage] = useState<"workspace" | "gmail-setup" | "ai-setup">(
    "workspace",
  );
  const [ollamaModel, setOllamaModel] = useState(loadOllamaModel);
  const [gmailConfig, setGmailConfig] = useState(() =>
    loadGmailConfig(import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim()),
  );
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [view, setView] = useState(loadWorkspaceView);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All statuses");
  const [priorityFilter, setPriorityFilter] = useState("All priorities");
  const [projectFilter, setProjectFilter] = useState("All projects");
  const [hideDone, setHideDone] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [notice, setNotice] = useState("");
  const [insights, setInsights] = useState<AiInsightResult | null>(
    initialInsights?.result ?? null,
  );
  const [insightLoading, setInsightLoading] = useState(false);
  const [insightError, setInsightError] = useState("");
  const [insightGeneratedAt, setInsightGeneratedAt] = useState<Date | null>(
    initialInsights?.generatedAt ?? null,
  );
  const [insightsStale, setInsightsStale] = useState(
    initialInsights?.stale ?? false,
  );
  const [gmailProcessing, setGmailProcessing] = useState(false);
  const [gmailStatus, setGmailStatus] = useState("");
  const [gmailError, setGmailError] = useState("");
  const [gmailConnectionStatus, setGmailConnectionStatus] = useState("");
  const [gmailTesting, setGmailTesting] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ProjectChatMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadSeedTasks()
      .then((loadedTasks) => {
        setTasks(loadedTasks);
        void requestPersistentTaskStorage();
      })
      .catch((reason: unknown) =>
        setError(
          reason instanceof Error ? reason.message : "Unable to load tasks.",
        ),
      )
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!loading) {
      void saveTasks(tasks).catch(() =>
        setError(
          "Actions could not be written to durable browser storage. Export a CSV backup before closing the app.",
        ),
      );
    }
  }, [tasks, loading]);

  useEffect(() => {
    saveWorkspaceView(view);
  }, [view]);

  useEffect(() => {
    if (insights && insightGeneratedAt) {
      saveInsights(insights, insightGeneratedAt, insightsStale);
    }
  }, [insightGeneratedAt, insights, insightsStale]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(""), 2800);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const projects = useMemo(() => uniqueValues(tasks, "Project"), [tasks]);
  const owners = useMemo(() => uniqueValues(tasks, "Owner"), [tasks]);
  const statuses = useMemo(() => uniqueValues(tasks, "Status"), [tasks]);
  const priorities = useMemo(() => uniqueValues(tasks, "Priority"), [tasks]);
  const filteredTasks = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return tasks.filter((task) => {
      if (projectFilter !== "All projects" && task.Project !== projectFilter)
        return false;
      if (statusFilter !== "All statuses" && task.Status !== statusFilter)
        return false;
      if (hideDone && completionPattern.test(task.Status.trim())) return false;
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
  }, [hideDone, priorityFilter, projectFilter, query, statusFilter, tasks]);

  const selectedTask = tasks.find((task) => task._key === selectedKey) ?? null;
  const completed = tasks.filter((task) =>
    completionPattern.test(task.Status.trim()),
  ).length;
  const highPriority = tasks.filter((task) =>
    /high|urgent|critical/i.test(task.Priority),
  ).length;
  const unassigned = tasks.filter((task) => !task.Owner.trim()).length;

  function updateTask(key: string, column: ColumnName, value: string) {
    markInsightsStale();
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

  function addTaskUpdate(key: string, update: string) {
    if (!update.trim()) return;
    markInsightsStale();
    setTasks((current) =>
      current.map((task) =>
        task._key === key ? applyTaskUpdate(task, update) : task,
      ),
    );
  }

  function addTask() {
    markInsightsStale();
    const key = `new-${crypto.randomUUID()}`;
    setTasks((current) => {
      const task = blankTask(nextSequentialId(current), key);
      if (projectFilter !== "All projects") task.Project = projectFilter;
      return [task, ...current];
    });
    setSelectedKey(key);
  }

  function deleteTask(key: string) {
    markInsightsStale();
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
      markInsightsStale();
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
    await clearSavedTasks();
    setLoading(true);
    try {
      markInsightsStale();
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

  function markInsightsStale() {
    setInsightsStale(true);
    setInsightError("");
  }

  async function analyzeTasks() {
    setInsightLoading(true);
    setInsightError("");
    try {
      setInsights(await generateProjectInsights(tasks, ollamaModel));
      setInsightGeneratedAt(new Date());
      setInsightsStale(false);
    } catch (reason) {
      setInsightError(
        reason instanceof Error
          ? reason.message
          : "The local model could not analyze these actions.",
      );
    } finally {
      setInsightLoading(false);
    }
  }

  async function processGmail() {
    if (!gmailConfig.clientId) {
      setGmailError(
        "Google OAuth is not configured. Open Gmail setup and add your client ID.",
      );
      setPage("gmail-setup");
      return;
    }

    setGmailProcessing(true);
    setGmailError("");
    setGmailStatus(`Connecting to ${gmailConfig.accountEmail}…`);
    try {
      const accessToken = await authorizeGmail(
        gmailConfig.clientId,
        gmailConfig.accountEmail,
      );
      await confirmGmailAccount(accessToken, gmailConfig.accountEmail);
      setGmailStatus(
        "Finding unread Primary emails with project names in the subject…",
      );
      const emails = await findUnreadProjectEmails(
        accessToken,
        projects,
        setGmailStatus,
      );
      let workingTasks = tasks;
      let updated = 0;
      let created = 0;

      for (let index = 0; index < emails.length; index += 1) {
        const email = emails[index];
        if (!email) continue;
        setGmailStatus(
          `Matching email ${index + 1} of ${emails.length} locally…`,
        );
        const projectTasks = workingTasks.filter(
          (task) => task.Project === email.project,
        );
        const decision = await matchEmailToAction(
          email,
          projectTasks,
          ollamaModel,
        );

        await markEmailRead(accessToken, email.messageId);
        if (decision.kind === "match") {
          workingTasks = workingTasks.map((task) =>
            task._key === decision.taskKey
              ? applyTaskUpdate(
                  { ...task, "Email Subject": email.subject },
                  `Email: ${decision.update}`,
                  email.receivedAt,
                )
              : task,
          );
          updated += 1;
        } else {
          const key = `email-${crypto.randomUUID()}`;
          let newTask = blankTask(nextSequentialId(workingTasks), key);
          newTask = {
            ...newTask,
            Action: decision.action,
            "Email Subject": email.subject,
            Priority: decision.priority,
            Project: email.project,
            Status:
              uniqueValues(workingTasks, "Status").find((status) =>
                /not started|to do|open/i.test(status),
              ) ?? "",
          };
          newTask = applyTaskUpdate(
            newTask,
            `Email: ${decision.update}`,
            email.receivedAt,
          );
          workingTasks = [newTask, ...workingTasks];
          created += 1;
        }
        setTasks(workingTasks);
      }

      if (updated + created > 0) markInsightsStale();
      setGmailStatus(
        emails.length === 0
          ? "No unread project emails were found in Primary."
          : `${updated} existing action${updated === 1 ? "" : "s"} updated. ${created} new action${created === 1 ? "" : "s"} created.`,
      );
    } catch (reason) {
      setGmailError(
        reason instanceof Error
          ? reason.message
          : "Gmail processing could not be completed.",
      );
      setGmailStatus("");
    } finally {
      setGmailProcessing(false);
    }
  }

  function updateGmailConfig(config: GmailConfig) {
    const saved = saveGmailConfig(config);
    setGmailConfig(saved);
    setGmailConnectionStatus("Configuration saved on this computer.");
    setGmailError("");
  }

  async function testGmailConnection(config: GmailConfig) {
    setGmailTesting(true);
    setGmailConnectionStatus("");
    setGmailError("");
    try {
      const validated = GmailConfigSchema.parse(config);
      const accessToken = await authorizeGmail(
        validated.clientId,
        validated.accountEmail,
      );
      await confirmGmailAccount(accessToken, validated.accountEmail);
      updateGmailConfig(validated);
      setGmailConnectionStatus(
        `Connected successfully to ${validated.accountEmail}.`,
      );
    } catch (reason) {
      setGmailError(
        reason instanceof Error
          ? reason.message
          : "The Gmail connection test failed.",
      );
    } finally {
      setGmailTesting(false);
    }
  }

  async function disconnectConfiguredGmail() {
    await disconnectGmail();
    setGmailConnectionStatus("The local Gmail session was disconnected.");
    setGmailStatus("");
    setGmailError("");
  }

  function resetGmailConfig() {
    clearGmailConfig();
    const defaults = loadGmailConfig(
      import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim(),
    );
    setGmailConfig(defaults);
    setGmailConnectionStatus("Saved Gmail settings were reset.");
    setGmailError("");
  }

  async function askPmo(question: string) {
    const history: ProjectChatHistoryItem[] = chatMessages
      .slice(-10)
      .map(({ role, content }) => ({ role, content }));
    const userMessage: ProjectChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: question.trim(),
    };
    setChatMessages((current) => [...current, userMessage]);
    setChatLoading(true);
    setChatError("");
    try {
      const answer = await askProjectActions(
        question,
        tasks,
        history,
        ollamaModel,
      );
      setChatMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: answer.answer,
          confidence: answer.confidence,
          references: answer.references,
        },
      ]);
    } catch (reason) {
      setChatError(
        reason instanceof Error
          ? reason.message
          : "The local PMO assistant could not answer that question.",
      );
    } finally {
      setChatLoading(false);
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
          <button
            className={`nav-item ${page === "workspace" ? "active" : ""}`}
            onClick={() => setPage("workspace")}
          >
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
            onClick={() => {
              setPage("workspace");
              setProjectFilter("All projects");
            }}
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
              onClick={() => {
                setPage("workspace");
                setProjectFilter(project);
              }}
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
          <button
            className={`nav-item ${page === "ai-setup" ? "active" : ""}`}
            onClick={() => setPage("ai-setup")}
          >
            <BrainCircuit size={17} /> AI model setup
          </button>
          <button
            className={`nav-item ${page === "gmail-setup" ? "active" : ""}`}
            onClick={() => setPage("gmail-setup")}
          >
            <Settings size={17} /> Gmail setup
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
              {page === "gmail-setup"
                ? "Gmail setup"
                : page === "ai-setup"
                  ? "AI model setup"
                  : projectFilter === "All projects"
                    ? "Action tracker"
                    : projectFilter}
            </strong>
          </div>
          {page === "workspace" ? (
            <div className="top-actions">
              <button
                className="secondary-button"
                onClick={() => setChatOpen(true)}
              >
                <BrainCircuit size={16} /> Ask PMO
              </button>
              <button
                className="secondary-button gmail-button"
                disabled={gmailProcessing}
                onClick={() => void processGmail()}
              >
                {gmailProcessing ? (
                  <RefreshCw className="spin" size={16} />
                ) : (
                  <MailCheck size={16} />
                )}
                {gmailProcessing ? "Processing…" : "Process Gmail"}
              </button>
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
          ) : (
            <div className="top-actions">
              <button
                className="secondary-button"
                onClick={() => setPage("workspace")}
              >
                <LayoutDashboard size={16} /> Back to actions
              </button>
            </div>
          )}
        </header>

        {page === "gmail-setup" ? (
          <GmailSetupPage
            key={`${gmailConfig.accountEmail}:${gmailConfig.clientId}`}
            config={gmailConfig}
            testing={gmailTesting}
            status={gmailConnectionStatus}
            error={gmailError}
            model={ollamaModel}
            onSave={updateGmailConfig}
            onTest={(config) => void testGmailConnection(config)}
            onDisconnect={() => void disconnectConfiguredGmail()}
            onReset={resetGmailConfig}
          />
        ) : page === "ai-setup" ? (
          <OllamaSetupPage
            selectedModel={ollamaModel}
            onSelect={(model) => {
              setOllamaModel(saveOllamaModel(model));
              markInsightsStale();
            }}
          />
        ) : (
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
                  <button
                    className={view === "insights" ? "active" : ""}
                    onClick={() => setView("insights")}
                  >
                    <BrainCircuit size={16} /> AI Focus
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
                  <label className="hide-done-toggle">
                    <input
                      type="checkbox"
                      checked={hideDone}
                      onChange={(event) => setHideDone(event.target.checked)}
                    />
                    <span>
                      <Check size={13} />
                    </span>
                    Hide done
                  </label>
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
                  priorityFilter !== "All priorities" ||
                  hideDone) && (
                  <button
                    onClick={() => {
                      setQuery("");
                      setStatusFilter("All statuses");
                      setPriorityFilter("All priorities");
                      setHideDone(false);
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
                  onAddUpdate={addTaskUpdate}
                  statuses={statuses}
                  priorities={priorities}
                />
              ) : view === "board" ? (
                <TaskBoard
                  tasks={filteredTasks}
                  statuses={statuses}
                  onSelect={setSelectedKey}
                  onUpdate={updateTask}
                />
              ) : (
                <AiFocusBoard
                  insights={insights}
                  tasks={tasks}
                  projectFilter={projectFilter}
                  loading={insightLoading}
                  error={insightError}
                  generatedAt={insightGeneratedAt}
                  stale={insightsStale}
                  model={ollamaModel}
                  onAnalyze={() => void analyzeTasks()}
                  onSelect={setSelectedKey}
                />
              )}
            </section>
          </div>
        )}
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
      {chatOpen && (
        <ProjectChatWindow
          messages={chatMessages}
          loading={chatLoading}
          error={chatError}
          model={ollamaModel}
          onAsk={(question) => void askPmo(question)}
          onClose={() => setChatOpen(false)}
          onClear={() => {
            setChatMessages([]);
            setChatError("");
          }}
          onSelectReference={(key) => {
            setChatOpen(false);
            setSelectedKey(key);
          }}
        />
      )}
      <datalist id="owner-options">
        {owners.map((owner) => (
          <option key={owner} value={owner} />
        ))}
      </datalist>
      <datalist id="project-options">
        {projects.map((project) => (
          <option key={project} value={project} />
        ))}
      </datalist>
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
      {page === "workspace" && (gmailStatus || gmailError) && (
        <div className={`gmail-status ${gmailError ? "error" : ""}`}>
          <div className="gmail-status-icon">
            {gmailError ? (
              <CircleAlert size={18} />
            ) : gmailProcessing ? (
              <RefreshCw className="spin" size={18} />
            ) : (
              <MailCheck size={18} />
            )}
          </div>
          <div>
            <strong>
              {gmailError ? "Gmail needs attention" : "Gmail processing"}
            </strong>
            <span>{gmailError || gmailStatus}</span>
          </div>
          {!gmailProcessing && (
            <button
              aria-label="Dismiss Gmail status"
              onClick={() => {
                setGmailStatus("");
                setGmailError("");
              }}
            >
              <X size={15} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function OllamaSetupPage({
  selectedModel,
  onSelect,
}: {
  selectedModel: string;
  onSelect: (model: string) => void;
}) {
  const [models, setModels] = useState<InstalledOllamaModel[]>([]);
  const [scanning, setScanning] = useState(true);
  const [scanError, setScanError] = useState("");
  const [lastScanned, setLastScanned] = useState<Date | null>(null);

  useEffect(() => {
    let active = true;
    scanInstalledOllamaModels()
      .then((installed) => {
        if (!active) return;
        setModels(installed);
        setLastScanned(new Date());
      })
      .catch((reason: unknown) => {
        if (active) {
          setScanError(
            reason instanceof Error ? reason.message : "Model scan failed.",
          );
        }
      })
      .finally(() => {
        if (active) setScanning(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function scanModels() {
    setScanning(true);
    setScanError("");
    try {
      setModels(await scanInstalledOllamaModels());
      setLastScanned(new Date());
    } catch (reason) {
      setScanError(
        reason instanceof Error ? reason.message : "Model scan failed.",
      );
    } finally {
      setScanning(false);
    }
  }

  const selectedInstalled = models.some(
    (model) => model.name === selectedModel,
  );

  return (
    <div className="page-content gmail-setup-page ai-setup-page">
      <section className="page-heading ai-settings-heading">
        <div className="heading-icon">
          <BrainCircuit size={23} />
        </div>
        <div>
          <p className="eyebrow">LOCAL AI CONFIGURATION</p>
          <h1>AI model setup</h1>
          <p>Select one installed Ollama model for every AI feature.</p>
        </div>
      </section>

      <section className="settings-card model-settings-card">
        <header>
          <div>
            <span className="settings-step">
              <BrainCircuit size={15} />
            </span>
            <div>
              <h2>Installed Ollama models</h2>
              <p>
                {lastScanned
                  ? `Last scanned ${lastScanned.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                  : "Scanning the local Ollama service"}
              </p>
            </div>
          </div>
          <button
            className="secondary-button scan-models-button"
            disabled={scanning}
            onClick={() => void scanModels()}
          >
            <RefreshCw className={scanning ? "spin" : ""} size={15} />
            {scanning ? "Scanning…" : "Scan models"}
          </button>
        </header>
        <div className="settings-card-body">
          <div className="selected-model-summary">
            <span>Application model</span>
            <strong>{selectedModel}</strong>
            <small>Used by AI Focus, Ask PMO, and Gmail action matching.</small>
          </div>

          {scanError && (
            <div className="setup-message error">
              <CircleAlert size={16} /> {scanError}
            </div>
          )}
          {!scanning && models.length > 0 && !selectedInstalled && (
            <div className="setup-message error">
              <CircleAlert size={16} /> The selected model is not currently
              installed. Choose an available model below.
            </div>
          )}
          {scanning && models.length === 0 ? (
            <div className="model-scan-state">
              <span className="loader" /> Looking for local models…
            </div>
          ) : models.length > 0 ? (
            <div className="model-list">
              {models.map((model) => (
                <label
                  className={`model-option ${model.name === selectedModel ? "selected" : ""}`}
                  key={model.name}
                >
                  <input
                    type="radio"
                    name="ollama-model"
                    value={model.name}
                    checked={model.name === selectedModel}
                    onChange={() => onSelect(model.name)}
                  />
                  <span className="model-radio">
                    <Check size={12} />
                  </span>
                  <div>
                    <strong>{model.name}</strong>
                    <span>
                      {[
                        model.parameterSize,
                        model.quantization,
                        model.family,
                        formatModelSize(model.size),
                      ]
                        .filter(Boolean)
                        .join(" · ") || "Installed model"}
                    </span>
                  </div>
                  {model.name === selectedModel && <b>In use</b>}
                </label>
              ))}
            </div>
          ) : !scanError ? (
            <div className="model-scan-state">
              No installed models were found.
            </div>
          ) : null}

          <div className="verification-note model-compatibility-note">
            Choose a chat-capable model that reliably supports structured JSON.
            Model changes apply to new AI requests; existing saved AI Focus
            results remain visible but are marked stale until regenerated.
          </div>
        </div>
      </section>
    </div>
  );
}

function formatModelSize(size: number | undefined): string {
  if (!size) return "";
  return `${(size / 1_000_000_000).toFixed(1)} GB`;
}

function GmailSetupPage({
  config,
  testing,
  status,
  error,
  model,
  onSave,
  onTest,
  onDisconnect,
  onReset,
}: {
  config: GmailConfig;
  testing: boolean;
  status: string;
  error: string;
  model: string;
  onSave: (config: GmailConfig) => void;
  onTest: (config: GmailConfig) => void;
  onDisconnect: () => void;
  onReset: () => void;
}) {
  const [draft, setDraft] = useState(config);
  const [validationError, setValidationError] = useState("");
  const authorizedOrigin = window.location.origin;

  function validate(): GmailConfig | null {
    const result = GmailConfigSchema.safeParse(draft);
    if (!result.success) {
      setValidationError(result.error.issues[0]?.message ?? "Check the form.");
      return null;
    }
    setValidationError("");
    return result.data;
  }

  return (
    <div className="page-content gmail-setup-page">
      <section className="page-heading gmail-heading">
        <div className="heading-icon">
          <MailCheck size={23} />
        </div>
        <div>
          <p className="eyebrow">GMAIL INTEGRATION</p>
          <h1>Gmail setup</h1>
          <p>
            Configure and verify the mailbox used to update project actions.
          </p>
        </div>
      </section>

      <div className="gmail-setup-grid">
        <section className="settings-card gmail-config-card">
          <header>
            <div>
              <span className="settings-step">1</span>
              <div>
                <h2>Connection details</h2>
                <p>Saved only in this browser on this computer.</p>
              </div>
            </div>
            <span className="local-badge">Local settings</span>
          </header>
          <div className="settings-card-body">
            <label className="settings-field">
              <span>Gmail account</span>
              <input
                type="email"
                aria-label="Gmail account"
                autoComplete="email"
                value={draft.accountEmail}
                placeholder="name@gmail.com"
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    accountEmail: event.target.value,
                  }))
                }
              />
              <small>
                The authorized Google account must match this address.
              </small>
            </label>
            <label className="settings-field">
              <span>OAuth 2.0 client ID</span>
              <input
                aria-label="OAuth 2.0 client ID"
                value={draft.clientId}
                spellCheck={false}
                placeholder="000000000000-example.apps.googleusercontent.com"
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    clientId: event.target.value,
                  }))
                }
              />
              <small>
                Use a Google OAuth Web application client ID. Never paste a
                client secret here.
              </small>
            </label>
            {(validationError || error) && (
              <div className="setup-message error">
                <CircleAlert size={16} /> {validationError || error}
              </div>
            )}
            {status && !error && (
              <div className="setup-message success">
                <CircleCheckBig size={16} /> {status}
              </div>
            )}
            <div className="settings-actions">
              <button
                className="primary-button"
                onClick={() => {
                  const validated = validate();
                  if (validated) onSave(validated);
                }}
              >
                <Check size={16} /> Save configuration
              </button>
              <button
                className="secondary-button test-gmail-button"
                disabled={testing}
                onClick={() => {
                  const validated = validate();
                  if (validated) onTest(validated);
                }}
              >
                {testing ? (
                  <RefreshCw className="spin" size={16} />
                ) : (
                  <MailCheck size={16} />
                )}
                {testing ? "Connecting…" : "Test connection"}
              </button>
            </div>
          </div>
        </section>

        <section className="settings-card google-cloud-card">
          <header>
            <div>
              <span className="settings-step">2</span>
              <div>
                <h2>Google Cloud configuration</h2>
                <p>Complete these steps in the Google Cloud Console.</p>
              </div>
            </div>
            <a
              href="https://console.cloud.google.com/apis/credentials"
              target="_blank"
              rel="noreferrer"
            >
              Open console
            </a>
          </header>
          <div className="settings-card-body setup-checklist">
            <div>
              <span>
                <Check size={13} />
              </span>
              <p>
                <strong>Enable the Gmail API</strong> for your Google Cloud
                project.
              </p>
            </div>
            <div>
              <span>
                <Check size={13} />
              </span>
              <p>
                <strong>Configure OAuth consent</strong> and add the Gmail
                account as a test user while the app is in Testing status.
              </p>
            </div>
            <div>
              <span>
                <Check size={13} />
              </span>
              <p>
                Create an <strong>OAuth client ID</strong> with application type
                <strong> Web application</strong>.
              </p>
            </div>
            <div>
              <span>
                <Check size={13} />
              </span>
              <p>
                Add this exact <strong>Authorized JavaScript origin</strong>:
              </p>
            </div>
            <code className="origin-value">{authorizedOrigin}</code>
            <div className="verification-note">
              Google can show an “unverified app” warning while the OAuth app is
              in Testing. Publishing and completing Google verification is the
              route to removing that warning for wider use.
            </div>
          </div>
        </section>

        <section className="settings-card processing-card">
          <header>
            <div>
              <span className="settings-step">3</span>
              <div>
                <h2>Processing rules</h2>
                <p>The safeguards currently applied to every Gmail run.</p>
              </div>
            </div>
          </header>
          <div className="settings-card-body rules-list">
            <div>
              <strong>Mailbox filter</strong>
              <span>Unread · Primary category only</span>
            </div>
            <div>
              <strong>Project detection</strong>
              <span>Existing project name in subject</span>
            </div>
            <div>
              <strong>No action match</strong>
              <span>Create a new sequential action</span>
            </div>
            <div>
              <strong>After processing</strong>
              <span>Mark relevant email as read</span>
            </div>
            <div>
              <strong>Email sending</strong>
              <span>Disabled</span>
            </div>
            <div>
              <strong>AI processing</strong>
              <span>Local Ollama {model}</span>
            </div>
          </div>
        </section>

        <section className="settings-card session-card">
          <header>
            <div>
              <span className="settings-step">4</span>
              <div>
                <h2>Session and privacy</h2>
                <p>Manage local authorization and configuration.</p>
              </div>
            </div>
          </header>
          <div className="settings-card-body">
            <p className="privacy-copy">
              OAuth access tokens stay in memory and are not written to disk or
              browser storage. The client ID is public configuration, not a
              secret. Email content is not logged or sent to a hosted AI model.
            </p>
            <div className="settings-actions">
              <button
                className="secondary-button text-button"
                onClick={onDisconnect}
              >
                Disconnect Gmail session
              </button>
              <button className="danger-button" onClick={onReset}>
                Reset saved settings
              </button>
            </div>
          </div>
        </section>
      </div>
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
  onAddUpdate,
  statuses,
  priorities,
}: {
  tasks: Task[];
  onSelect: (key: string) => void;
  onUpdate: (key: string, column: ColumnName, value: string) => void;
  onAddUpdate: (key: string, update: string) => void;
  statuses: string[];
  priorities: string[];
}) {
  return (
    <div className="table-scroll">
      <table className="task-table">
        <thead>
          <tr>
            {DISPLAY_COLUMNS.map((column) => (
              <th
                key={column}
                className={column === "ID" ? "sticky-column" : ""}
              >
                {columnLabel(column)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => (
            <tr key={task._key}>
              {DISPLAY_COLUMNS.map((column) => (
                <td
                  key={column}
                  className={
                    column === "ID"
                      ? "sticky-column"
                      : column === "Action"
                        ? "action-cell"
                        : ""
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
                  ) : column === "Update" ? (
                    <UpdateCell
                      value={task.Update}
                      actionName={task.Action}
                      onAdd={(update) => onAddUpdate(task._key, update)}
                    />
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
                        list="owner-options"
                        value={task.Owner}
                        onChange={(event) =>
                          onUpdate(task._key, column, event.target.value)
                        }
                      />
                    </div>
                  ) : column === "Project" ? (
                    <input
                      aria-label={`Project for ${task.Action}`}
                      list="project-options"
                      value={task.Project}
                      onChange={(event) =>
                        onUpdate(task._key, column, event.target.value)
                      }
                    />
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

function UpdateCell({
  value,
  actionName,
  onAdd,
}: {
  value: string;
  actionName: string;
  onAdd: (update: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");

  function submit() {
    if (!draft.trim()) return;
    onAdd(draft);
    setDraft("");
    setOpen(false);
  }

  if (!open) {
    return (
      <button
        className={`update-preview ${value ? "" : "empty"}`}
        aria-label={`Add update for ${actionName}`}
        data-full-text={value}
        title={value}
        onClick={() => setOpen(true)}
      >
        <span className="update-preview-text">{value || "+ Add update"}</span>
      </button>
    );
  }

  return (
    <div className="update-composer">
      <textarea
        autoFocus
        value={draft}
        placeholder="Type a new update…"
        aria-label={`New update for ${actionName}`}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setDraft("");
            setOpen(false);
          }
          if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            submit();
          }
        }}
      />
      <div>
        <span>Ctrl + Enter to add</span>
        <button
          type="button"
          onClick={() => {
            setDraft("");
            setOpen(false);
          }}
        >
          Cancel
        </button>
        <button type="button" className="add-update" onClick={submit}>
          Add
        </button>
      </div>
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

function AiFocusBoard({
  insights,
  tasks,
  projectFilter,
  loading,
  error,
  generatedAt,
  stale,
  model,
  onAnalyze,
  onSelect,
}: {
  insights: AiInsightResult | null;
  tasks: Task[];
  projectFilter: string;
  loading: boolean;
  error: string;
  generatedAt: Date | null;
  stale: boolean;
  model: string;
  onAnalyze: () => void;
  onSelect: (key: string) => void;
}) {
  const taskByKey = new Map(tasks.map((task) => [task._key, task]));
  const visibleProjects =
    insights?.projects.filter(
      (project) =>
        projectFilter === "All projects" || project.project === projectFilter,
    ) ?? [];

  if (!insights) {
    return (
      <div className="insight-empty">
        <div className="insight-orbit">
          <BrainCircuit size={28} />
        </div>
        <p className="eyebrow">LOCAL AI PRIORITIZATION</p>
        <h2>Find the three actions that matter most</h2>
        <p>
          {model} will review priority, status, and recorded updates across all
          actions. Task data stays on this computer.
        </p>
        <button
          className="primary-button insight-button"
          disabled={loading}
          onClick={onAnalyze}
        >
          <RefreshCw className={loading ? "spin" : ""} size={16} />
          {loading ? "Reviewing all actions…" : "Generate focus board"}
        </button>
        {error && (
          <div className="insight-error">
            <CircleAlert size={15} /> {error}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="ai-focus-wrap">
      <div className="ai-focus-header">
        <div>
          <span>
            <BrainCircuit size={14} /> AI + priority focus
          </span>
          <small>
            {stale
              ? `Selected model · ${model} · Refresh required`
              : `Model insight · ${model}`}
            {generatedAt
              ? ` · Generated ${generatedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
              : ""}
          </small>
        </div>
        <button
          className="secondary-button"
          disabled={loading}
          onClick={onAnalyze}
        >
          <RefreshCw className={loading ? "spin" : ""} size={14} />
          {loading ? "Reviewing…" : "Refresh insights"}
        </button>
      </div>
      {error && (
        <div className="insight-inline-error">
          <CircleAlert size={15} /> {error}
        </div>
      )}
      {stale && (
        <div className="insight-stale-notice">
          <RefreshCw size={14} />
          Task data has changed since this board was generated. The previous
          result is retained; refresh insights when ready.
        </div>
      )}
      <div className="ai-project-grid">
        {visibleProjects.map((project) => (
          <section className="ai-project" key={project.project}>
            <header>
              <div className="ai-project-icon">
                {project.project.slice(0, 1).toUpperCase()}
              </div>
              <div>
                <h3>{project.project}</h3>
                <span>Top {project.actions.length} actions</span>
              </div>
            </header>
            <p className="project-overview">{project.overview}</p>
            <div className="focus-list">
              {project.actions.map((insight, index) => {
                const task = taskByKey.get(insight.key);
                if (!task) return null;
                return (
                  <button
                    className="focus-card"
                    key={insight.key}
                    onClick={() => onSelect(insight.key)}
                  >
                    <span className="focus-rank">{index + 1}</span>
                    <div className="focus-content">
                      <div className="focus-card-topline">
                        <div className="focus-labels">
                          <span
                            className={`priority-label ${priorityTone(task.Priority)}`}
                          >
                            {task.Priority || "No priority"}
                          </span>
                          <span
                            className={`insight-source ${insight.source === "model" ? "model" : "fallback"}`}
                          >
                            {insight.source === "model"
                              ? "AI insight"
                              : "Priority fallback"}
                          </span>
                        </div>
                        <small>#{task.ID}</small>
                      </div>
                      <h4>{task.Action || "Untitled action"}</h4>
                      <p>{insight.reason}</p>
                      <div className="next-step">
                        <strong>Suggested next step</strong>
                        <span>{insight.nextStep}</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
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
            {DISPLAY_COLUMNS.filter((column) => column !== "Action").map(
              (column) => (
                <label className="property-row" key={column}>
                  <span>{columnLabel(column)}</span>
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
                  ) : column === "Owner" || column === "Project" ? (
                    <input
                      list={
                        column === "Owner" ? "owner-options" : "project-options"
                      }
                      value={task[column]}
                      onChange={(event) =>
                        onUpdate(task._key, column, event.target.value)
                      }
                    />
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

function ProjectChatWindow({
  messages,
  loading,
  error,
  model,
  onAsk,
  onClose,
  onClear,
  onSelectReference,
}: {
  messages: ProjectChatMessage[];
  loading: boolean;
  error: string;
  model: string;
  onAsk: (question: string) => void;
  onClose: () => void;
  onClear: () => void;
  onSelectReference: (key: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const messageEndRef = useRef<HTMLDivElement>(null);
  const suggestions = [
    "Which high-priority actions need attention?",
    "Summarize progress by project.",
    "Which actions have no owner?",
  ];

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [loading, messages]);

  function submit(question: string) {
    const trimmed = question.trim();
    if (!trimmed || loading) return;
    onAsk(trimmed);
    setDraft("");
  }

  return (
    <div
      className="chat-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="chat-window" aria-label="Ask PMO assistant">
        <header className="chat-header">
          <span className="chat-model-icon">
            <BrainCircuit size={20} />
          </span>
          <div>
            <strong>Ask PMO</strong>
            <span>{model} · Local project assistant</span>
          </div>
          {messages.length > 0 && (
            <button className="chat-clear" onClick={onClear}>
              Clear
            </button>
          )}
          <button className="icon-button" aria-label="Close" onClick={onClose}>
            <X size={19} />
          </button>
        </header>
        <div className="chat-messages" aria-live="polite">
          {messages.length === 0 ? (
            <div className="chat-empty">
              <BrainCircuit size={30} />
              <h2>Ask about your project actions</h2>
              <p>
                Answers use the current action table and link back to referenced
                Action IDs. Data stays on this computer.
              </p>
              <div className="chat-suggestions">
                {suggestions.map((suggestion) => (
                  <button key={suggestion} onClick={() => submit(suggestion)}>
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((message) => (
              <article
                className={`chat-message ${message.role}`}
                key={message.id}
              >
                <div className="chat-message-meta">
                  <strong>{message.role === "user" ? "You" : "PMO AI"}</strong>
                  {message.confidence && (
                    <span className={`confidence ${message.confidence}`}>
                      {message.confidence} confidence
                    </span>
                  )}
                </div>
                <p>{message.content}</p>
                {message.references && message.references.length > 0 && (
                  <div className="chat-references">
                    <span>Referenced actions</span>
                    {message.references.map((reference) => (
                      <button
                        key={reference.taskKey}
                        title={reference.relevance}
                        onClick={() => onSelectReference(reference.taskKey)}
                      >
                        #{reference.actionId}
                      </button>
                    ))}
                  </div>
                )}
              </article>
            ))
          )}
          {loading && (
            <div className="chat-thinking">
              <span className="loader" /> Reviewing project actions…
            </div>
          )}
          {error && (
            <div className="chat-error">
              <CircleAlert size={16} /> {error}
            </div>
          )}
          <div ref={messageEndRef} />
        </div>
        <form
          className="chat-composer"
          onSubmit={(event) => {
            event.preventDefault();
            submit(draft);
          }}
        >
          <textarea
            value={draft}
            maxLength={2000}
            placeholder="Ask about priorities, owners, status, updates…"
            aria-label="Question about project actions"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submit(draft);
              }
            }}
          />
          <button
            className="primary-button"
            disabled={loading || !draft.trim()}
          >
            {loading ? (
              <RefreshCw className="spin" size={16} />
            ) : (
              <Sparkles size={16} />
            )}
            Ask
          </button>
          <small>Enter to send · Shift+Enter for a new line</small>
        </form>
      </section>
    </div>
  );
}

export default App;
