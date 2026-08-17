import React from "react";
import {
  getCurrentUserId,
  getJwt,
  onAuthChange,
} from "../../lib/identity";
import {
  createQuickNote,
  mergeNotesPayload,
  readLocalNotes,
  writeLocalNotes,
  type NoteTab,
  type NotesPayload,
} from "../../lib/notesStore";
import {
  EMPTY_RESOURCE_META,
  fetchAuthedResource,
  ResourceApiError,
  saveAuthedResource,
  type ResourceMeta,
} from "../../lib/resourceApi";
import {
  createTaskObject,
  loadTasks,
  saveTasks,
  taskBackupKey,
  taskStorageKey,
} from "../../lib/tasksStore";
import type { Task } from "../../types/task";

const NOTES_ENDPOINT = "/.netlify/functions/notes";

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
  const [noteSaveStatus, setNoteSaveStatus] = React.useState("");
  const [storageKeys, setStorageKeys] = React.useState({
    taskKey: taskStorageKey(),
    backupKey: taskBackupKey(),
  });
  const notesRef = React.useRef<NoteTab[]>([]);
  const activeNoteIdRef = React.useRef("");
  const serverMetaRef = React.useRef<ResourceMeta>(EMPTY_RESOURCE_META);

  const today = React.useMemo(() => todayDateKey(), []);

  const applyNotes = React.useCallback((payload: NotesPayload) => {
    const activeId =
      payload.notes.find((note) => note.id === payload.activeId)?.id ??
      payload.notes[0]?.id ??
      "";
    const normalized = { notes: payload.notes, activeId };

    notesRef.current = normalized.notes;
    activeNoteIdRef.current = normalized.activeId;
    setNotes(normalized.notes);
    writeLocalNotes(normalized);
  }, []);

  const refresh = React.useCallback(async () => {
    const userId = await getCurrentUserId();
    const taskKey = taskStorageKey(userId);
    const backupKey = taskBackupKey(userId);
    const localNotes = readLocalNotes();

    setStorageKeys({ taskKey, backupKey });
    setTasks(loadTasks(taskKey, backupKey));

    try {
      const jwt = await getJwt();

      if (!jwt) {
        serverMetaRef.current = EMPTY_RESOURCE_META;
        applyNotes(localNotes);
        setNoteSaveStatus("");
        return;
      }

      const { data: remote, meta } = await fetchAuthedResource<NotesPayload>(
        NOTES_ENDPOINT,
        jwt,
      );
      serverMetaRef.current = meta;

      if (Array.isArray(remote?.notes) && remote.notes.length > 0) {
        applyNotes(remote);
        return;
      }

      const saved = await saveAuthedResource(
        NOTES_ENDPOINT,
        jwt,
        localNotes,
        meta,
      );
      serverMetaRef.current = saved.meta;
      applyNotes(localNotes);
    } catch (error) {
      console.error("Quick notes failed to load from account storage", error);
      applyNotes(localNotes);
      setNoteSaveStatus("Cloud unavailable - using local notes");
    }
  }, [applyNotes]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  React.useEffect(() => {
    let unsubscribe: (() => void) | null = null;
    let disposed = false;

    void onAuthChange(() => {
      void refresh();
    })
      .then((nextUnsubscribe) => {
        if (disposed) {
          nextUnsubscribe();
        } else {
          unsubscribe = nextUnsubscribe;
        }
      })
      .catch((error) => {
        console.error("Quick Access could not subscribe to auth changes", error);
      });

    return () => {
      disposed = true;
      unsubscribe?.();
    };
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

  async function addNote(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = noteInput.trim();
    if (!body) return;

    const nextNote = createQuickNote(body);
    const payload = {
      notes: [...notesRef.current, nextNote],
      activeId: nextNote.id,
    };

    applyNotes(payload);
    setNoteInput("");
    setNoteSaveStatus("Saving to cloud...");

    let jwt: string | null;

    try {
      jwt = await getJwt();
    } catch (error) {
      console.error("Quick note could not read the current session", error);
      setNoteSaveStatus("Cloud save failed - saved locally");
      return;
    }

    if (!jwt) {
      setNoteSaveStatus("Saved locally");
      return;
    }

    try {
      const { meta } = await saveAuthedResource(
        NOTES_ENDPOINT,
        jwt,
        payload,
        serverMetaRef.current,
      );
      serverMetaRef.current = meta;
      setNoteSaveStatus("Saved to cloud");
    } catch (error) {
      if (error instanceof ResourceApiError && error.status === 409) {
        try {
          const { data: remote, meta } =
            await fetchAuthedResource<NotesPayload>(NOTES_ENDPOINT, jwt);
          const latestLocal = {
            notes: notesRef.current,
            activeId: activeNoteIdRef.current,
          };
          const merged = mergeNotesPayload(remote, latestLocal);
          const saved = await saveAuthedResource(
            NOTES_ENDPOINT,
            jwt,
            merged,
            meta,
          );

          serverMetaRef.current = saved.meta;
          applyNotes(merged);
          setNoteSaveStatus("Saved to cloud");
          return;
        } catch (retryError) {
          error = retryError;
        }
      }

      console.error("Quick note failed to save to account storage", error);
      setNoteSaveStatus("Cloud save failed - saved locally");
    }
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
        {noteSaveStatus ? (
          <p className="lo-quick__save-status" role="status">
            {noteSaveStatus}
          </p>
        ) : null}
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
