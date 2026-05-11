import React from "react";
import { getCurrentUserId } from "../../lib/identity";
import {
  createQuickNote,
  readLocalNotes,
  writeLocalNotes,
  type NoteTab,
} from "../../lib/notesStore";
import {
  createTaskObject,
  loadTasks,
  saveTasks,
  taskBackupKey,
  taskStorageKey,
} from "../../lib/tasksStore";
import type { Task } from "../../types/task";

function todayDateKey() {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function nowISO() {
  return new Date().toISOString();
}

function stripHtml(value: string) {
  const node = document.createElement("div");
  node.innerHTML = value;
  return node.textContent?.trim() ?? "";
}

function taskMatchesToday(task: Task, today: string) {
  return (
    task.status !== "done" &&
    (String(task.myDay ?? "").slice(0, 10) === today ||
      String(task.plannedFor ?? "").slice(0, 10) === today ||
      String(task.dueDate ?? "").slice(0, 10) === today)
  );
}

function createQuickTask(title: string, existing: Task[]): Task {
  const today = todayDateKey();

  return createTaskObject({
    title,
    dueDate: today,
    myDay: today,
    plannedFor: today,
  }, existing);
}

export default function QuickAccess() {
  const [tasks, setTasks] = React.useState<Task[]>([]);
  const [notes, setNotes] = React.useState<NoteTab[]>([]);
  const [taskInput, setTaskInput] = React.useState("");
  const [noteInput, setNoteInput] = React.useState("");
  const [storageKeys, setStorageKeys] = React.useState({
    taskKey: taskStorageKey(),
    backupKey: taskBackupKey(),
  });

  const today = React.useMemo(() => todayDateKey(), []);

  const refresh = React.useCallback(async () => {
    const userId = await getCurrentUserId();
    const taskKey = taskStorageKey(userId);
    const backupKey = taskBackupKey(userId);

    setStorageKeys({ taskKey, backupKey });
    setTasks(loadTasks(taskKey, backupKey));
    setNotes(readLocalNotes().notes);
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const todaysTasks = React.useMemo(
    () =>
      tasks
        .filter((task) => taskMatchesToday(task, today))
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
        .slice(0, 5),
    [tasks, today],
  );

  const notePreviews = React.useMemo(
    () =>
      notes
        .slice(-3)
        .reverse()
        .map((note) => ({
          ...note,
          preview: stripHtml(note.content) || "Blank note",
        })),
    [notes],
  );

  function persistTasks(nextTasks: Task[]) {
    setTasks(nextTasks);
    saveTasks(nextTasks, storageKeys.taskKey, storageKeys.backupKey);
  }

  function addTask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = taskInput.trim();
    if (!title) return;

    persistTasks([createQuickTask(title, tasks), ...tasks]);
    setTaskInput("");
  }

  function completeTask(id: string) {
    persistTasks(
      tasks.map((task) =>
        task.id === id
          ? { ...task, status: "done", updatedAt: nowISO() }
          : task,
      ),
    );
  }

  function addNote(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = noteInput.trim();
    if (!body) return;

    const nextNote = createQuickNote(body);
    const nextNotes = [...notes, nextNote];

    setNotes(nextNotes);
    writeLocalNotes({ notes: nextNotes, activeId: nextNote.id });
    setNoteInput("");
  }

  return (
    <section className="lo-quick" aria-labelledby="quick-title">
      <header className="lo-quick__header">
        <div>
          <p className="lo-quick__eyebrow">Today</p>
          <h1 id="quick-title">Quick Access</h1>
        </div>
        <a className="lo-quick__home" href="/" aria-label="Open LifeOS home">
          <img src="/icons/white/home.png" alt="" />
        </a>
      </header>

      <div className="lo-quick__summary" aria-label="Today summary">
        <div>
          <strong>{todaysTasks.length}</strong>
          <span>tasks today</span>
        </div>
        <div>
          <strong>{notes.length}</strong>
          <span>notes</span>
        </div>
      </div>

      <form className="lo-quick__composer" onSubmit={addTask}>
        <label htmlFor="quick-task">Quick task</label>
        <div className="lo-quick__input-row">
          <input
            id="quick-task"
            value={taskInput}
            onChange={(event) => setTaskInput(event.target.value)}
            placeholder="Add a task for today"
          />
          <button type="submit" aria-label="Add task">
            <img src="/icons/white/plus.png" alt="" />
          </button>
        </div>
      </form>

      <div className="lo-quick__section">
        <div className="lo-quick__section-head">
          <h2>Today's Tasks</h2>
          <a href="/tasks">Open</a>
        </div>
        <div className="lo-quick__list">
          {todaysTasks.length ? (
            todaysTasks.map((task) => (
              <button
                key={task.id}
                type="button"
                className="lo-quick__task"
                onClick={() => completeTask(task.id)}
              >
                <span aria-hidden="true" />
                <strong>{task.title}</strong>
              </button>
            ))
          ) : (
            <p className="lo-quick__empty">No tasks pinned to today.</p>
          )}
        </div>
      </div>

      <form className="lo-quick__composer" onSubmit={addNote}>
        <label htmlFor="quick-note">Quick note</label>
        <textarea
          id="quick-note"
          value={noteInput}
          onChange={(event) => setNoteInput(event.target.value)}
          placeholder="Capture a thought"
          rows={3}
        />
        <button type="submit" className="lo-quick__wide-action">
          Add note
        </button>
      </form>

      <div className="lo-quick__section">
        <div className="lo-quick__section-head">
          <h2>Recent Notes</h2>
          <a href="/">Open</a>
        </div>
        <div className="lo-quick__notes">
          {notePreviews.length ? (
            notePreviews.map((note) => (
              <article key={note.id} className="lo-quick__note">
                <strong>{note.title}</strong>
                <p>{note.preview}</p>
              </article>
            ))
          ) : (
            <p className="lo-quick__empty">No notes yet.</p>
          )}
        </div>
      </div>
    </section>
  );
}
