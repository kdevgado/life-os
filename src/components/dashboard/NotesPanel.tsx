import React from "react";
import { createPortal } from "react-dom";
import {
  createNote,
  mergeNotesPayload,
  readLocalNotes,
  writeLocalNotes,
  type NoteTab,
  type NotesPayload,
} from "../../lib/notesStore";
import { getJwt, onAuthChange } from "../../lib/identity";
import {
  EMPTY_RESOURCE_META,
  fetchAuthedResource,
  ResourceApiError,
  saveAuthedResource,
  type ResourceMeta,
} from "../../lib/resourceApi";

type Command = "bold" | "italic" | "insertUnorderedList" | "insertOrderedList";
type SaveStatus = {
  label: string;
  tone: "pending" | "success" | "local" | "error";
  title?: string;
};

const NOTES_DROPDOWN_ID = "notes-menu";
const NOTES_ENDPOINT = "/.netlify/functions/notes";

function ToolbarButton({
  label,
  onClick,
  icon,
  children,
}: {
  label: string;
  onClick: () => void;
  icon?: string;
  children?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className="lo-notebar__btn"
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      title={label}
      aria-label={label}
    >
      {icon ? <img src={icon} alt="" className="lo-notebar__icon" /> : children}
    </button>
  );
}

function NotesMenu({
  notes,
  activeId,
  onOpenNote,
  onAddNote,
  onRenameNote,
  onDeleteNote,
}: {
  notes: NoteTab[];
  activeId: string;
  onOpenNote: (id: string) => void;
  onAddNote: () => void;
  onRenameNote: (id: string, title: string) => void;
  onDeleteNote: (id: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [hoveredId, setHoveredId] = React.useState<string | null>(null);
  const [menuPos, setMenuPos] = React.useState<{
    top: number;
    right: number;
  } | null>(null);
  const menuRef = React.useRef<HTMLDivElement | null>(null);
  const panelRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (menuRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
      setHoveredId(null);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        setHoveredId(null);
      }
    };

    const handleDropdownOpened = (event: Event) => {
      const customEvent = event as CustomEvent<{ id?: string }>;
      if (customEvent.detail?.id === NOTES_DROPDOWN_ID) return;
      setOpen(false);
      setHoveredId(null);
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("keydown", handleEscape);
    window.addEventListener(
      "lifeos:dropdown-opened",
      handleDropdownOpened as EventListener,
    );

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("keydown", handleEscape);
      window.removeEventListener(
        "lifeos:dropdown-opened",
        handleDropdownOpened as EventListener,
      );
    };
  }, [open]);

  return (
    <div className="lo-notes-menu" ref={menuRef}>
      <button
        type="button"
        className="lo-dropdown-trigger lo-notes-menu__trigger"
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const nextOpen = !open;

          setMenuPos({
            top: rect.bottom + 8,
            right: Math.max(12, window.innerWidth - rect.right),
          });

          if (nextOpen) {
            window.dispatchEvent(
              new CustomEvent("lifeos:dropdown-opened", {
                detail: { id: NOTES_DROPDOWN_ID },
              }),
            );
          }

          setOpen(nextOpen);
        }}
        title="Manage notes"
        aria-label="Manage notes"
        aria-expanded={open}
      >
        <span>Notes</span>
        <span className="lo-dropdown-caret" aria-hidden="true">
          {"\u25BE"}
        </span>
      </button>

      {open && menuPos
        ? createPortal(
        <div
          ref={panelRef}
          className="lo-notes-menu__panel"
          style={{
            position: "fixed",
            top: menuPos.top,
            right: menuPos.right,
          }}
        >
          <button
            type="button"
            className="lo-notes-menu__new"
            onClick={() => {
              onAddNote();
              setOpen(false);
            }}
            title="New note"
            aria-label="New note"
          >
            + New note
          </button>

          <div className="lo-notes-menu__list">
            {notes.map((note) => (
              <div
                key={note.id}
                className={`lo-notes-menu__item ${note.id === activeId ? "is-active" : ""}`}
                onMouseEnter={() => setHoveredId(note.id)}
                onMouseLeave={() =>
                  setHoveredId((id) => (id === note.id ? null : id))
                }
              >
                <button
                  type="button"
                  className="lo-notes-menu__open"
                  onClick={() => {
                    onOpenNote(note.id);
                    setOpen(false);
                  }}
                  title={note.title}
                  aria-label={`Open ${note.title}`}
                >
                  <span className="lo-notes-menu__name">{note.title}</span>
                </button>

                {(hoveredId === note.id || note.id === activeId) && (
                  <div className="lo-notes-menu__actions">
                    <button
                      type="button"
                      className="lo-notes-menu__action"
                      title="Rename note"
                      aria-label={`Rename ${note.title}`}
                      onClick={() => {
                        const next = window.prompt("Rename note", note.title);
                        if (next && next.trim()) {
                          onRenameNote(note.id, next.trim());
                        }
                      }}
                    >
                      Rename
                    </button>

                    <button
                      type="button"
                      className="lo-notes-menu__action is-danger"
                      title="Delete note"
                      aria-label={`Delete ${note.title}`}
                      onClick={() => {
                        const ok = window.confirm(`Delete "${note.title}"?`);
                        if (ok) onDeleteNote(note.id);
                      }}
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>,
        document.body,
          )
        : null}
    </div>
  );
}

export default function NotesPanel() {
  const [notes, setNotes] = React.useState<NoteTab[]>([]);
  const [activeId, setActiveId] = React.useState("");
  const [saveStatus, setSaveStatus] = React.useState<SaveStatus | null>(null);
  const editorRef = React.useRef<HTMLDivElement | null>(null);
  const notesRef = React.useRef<NoteTab[]>([]);
  const activeIdRef = React.useRef("");
  const hydratedRef = React.useRef(false);
  const skipCloudSaveFingerprintRef = React.useRef<string | null>(null);
  const saveStatusTimerRef = React.useRef<number | null>(null);
  const cloudSaveTimerRef = React.useRef<number | null>(null);
  const cloudSaveRunningRef = React.useRef(false);
  const pendingCloudSaveRef = React.useRef<NotesPayload | null>(null);
  const serverMetaRef = React.useRef<ResourceMeta>(EMPTY_RESOURCE_META);

  React.useEffect(() => {
    notesRef.current = notes;
  }, [notes]);

  React.useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  React.useEffect(() => {
    return () => {
      if (saveStatusTimerRef.current) {
        window.clearTimeout(saveStatusTimerRef.current);
      }
      if (cloudSaveTimerRef.current) {
        window.clearTimeout(cloudSaveTimerRef.current);
      }
    };
  }, []);

  const showSaveStatus = React.useCallback(
    (status: SaveStatus, clearAfterMs?: number) => {
      if (saveStatusTimerRef.current) {
        window.clearTimeout(saveStatusTimerRef.current);
        saveStatusTimerRef.current = null;
      }

      setSaveStatus(status);

      if (clearAfterMs) {
        saveStatusTimerRef.current = window.setTimeout(() => {
          setSaveStatus(null);
          saveStatusTimerRef.current = null;
        }, clearAfterMs);
      }
    },
    [],
  );

  const applyLoadedNotes = React.useCallback((payload: NotesPayload) => {
    const nextActiveId =
      payload.notes.find((note) => note.id === payload.activeId)?.id ??
      payload.notes[0]?.id ??
      "";
    const nextPayload = { notes: payload.notes, activeId: nextActiveId };

    skipCloudSaveFingerprintRef.current = JSON.stringify(nextPayload);
    notesRef.current = nextPayload.notes;
    activeIdRef.current = nextPayload.activeId;
    setNotes(nextPayload.notes);
    setActiveId(nextPayload.activeId);
    writeLocalNotes(nextPayload);
    hydratedRef.current = true;
  }, []);

  const reloadNotes = React.useCallback(async () => {
    const local = readLocalNotes();

    if (cloudSaveTimerRef.current) {
      window.clearTimeout(cloudSaveTimerRef.current);
      cloudSaveTimerRef.current = null;
    }
    pendingCloudSaveRef.current = null;

    try {
      const jwt = await getJwt();

      if (!jwt) {
        serverMetaRef.current = EMPTY_RESOURCE_META;
        applyLoadedNotes(local);
        setSaveStatus(null);
        return;
      }

      showSaveStatus({ label: "Syncing...", tone: "pending" });
      const { data: remote, meta } = await fetchAuthedResource<NotesPayload>(
        NOTES_ENDPOINT,
        jwt,
      );
      serverMetaRef.current = meta;

      if (Array.isArray(remote?.notes) && remote.notes.length > 0) {
        applyLoadedNotes(remote);
        showSaveStatus(
          { label: "Cloud synced", tone: "success" },
          1800,
        );
        return;
      }

      // Seed a new account from this device's existing local notes instead of
      // waiting for another edit before the first cloud write.
      const saved = await saveAuthedResource(
        NOTES_ENDPOINT,
        jwt,
        local,
        meta,
      );
      serverMetaRef.current = saved.meta;
      applyLoadedNotes(local);
      showSaveStatus(
        { label: "Saved to cloud", tone: "success" },
        1800,
      );
    } catch (error) {
      console.error("Notes failed to load from account storage", error);
      applyLoadedNotes(local);
      showSaveStatus({
        label: "Cloud unavailable - saved locally",
        tone: "error",
        title: error instanceof Error ? error.message : undefined,
      });
    }
  }, [applyLoadedNotes, showSaveStatus]);

  React.useEffect(() => {
    void reloadNotes();
  }, [reloadNotes]);

  React.useEffect(() => {
    let unsubscribe: (() => void) | null = null;
    let disposed = false;

    void onAuthChange(() => {
      void reloadNotes();
    })
      .then((nextUnsubscribe) => {
        if (disposed) {
          nextUnsubscribe();
        } else {
          unsubscribe = nextUnsubscribe;
        }
      })
      .catch((error) => {
        console.error("Notes could not subscribe to auth changes", error);
      });

    return () => {
      disposed = true;
      unsubscribe?.();
    };
  }, [reloadNotes]);

  const activeNote = React.useMemo(
    () => notes.find((note) => note.id === activeId) ?? notes[0] ?? null,
    [notes, activeId],
  );

  React.useEffect(() => {
    if (!activeNote || !editorRef.current) return;
    if (editorRef.current.innerHTML !== activeNote.content) {
      editorRef.current.innerHTML = activeNote.content || "<p></p>";
    }
  }, [activeNote?.id, activeNote?.content]);

  React.useEffect(() => {
    if (!hydratedRef.current || !notes.length || !activeId) return;
    writeLocalNotes({ notes, activeId });
  }, [notes, activeId]);

  const drainCloudSaveQueue = React.useCallback(async () => {
    if (cloudSaveRunningRef.current) return;
    cloudSaveRunningRef.current = true;
    let conflictRetries = 0;

    try {
      while (pendingCloudSaveRef.current) {
        const payload = pendingCloudSaveRef.current;
        pendingCloudSaveRef.current = null;
        let jwt: string | null;

        try {
          jwt = await getJwt();
        } catch (error) {
          console.error("Notes could not read the current session", error);
          showSaveStatus({
            label: "Cloud save failed - saved locally",
            tone: "error",
            title: error instanceof Error ? error.message : undefined,
          });
          continue;
        }

        if (!jwt) {
          showSaveStatus(
            { label: "Saved locally", tone: "local" },
            1800,
          );
          continue;
        }

        showSaveStatus({ label: "Saving to cloud...", tone: "pending" });

        try {
          const { meta } = await saveAuthedResource(
            NOTES_ENDPOINT,
            jwt,
            payload,
            serverMetaRef.current,
          );
          serverMetaRef.current = meta;
          conflictRetries = 0;
          showSaveStatus(
            { label: "Saved to cloud", tone: "success" },
            1800,
          );
        } catch (error) {
          if (error instanceof ResourceApiError && error.status === 409) {
            if (conflictRetries >= 1) {
              showSaveStatus({
                label: "Cloud keeps changing - saved locally",
                tone: "error",
                title: error.message,
              });
              continue;
            }

            try {
              conflictRetries += 1;
              const { data: remote, meta } =
                await fetchAuthedResource<NotesPayload>(NOTES_ENDPOINT, jwt);
              const latestLocal = {
                notes: notesRef.current,
                activeId: activeIdRef.current,
              };
              const merged = mergeNotesPayload(remote, latestLocal);

              serverMetaRef.current = meta;
              applyLoadedNotes(merged);
              pendingCloudSaveRef.current = merged;
              showSaveStatus({
                label: "Merging cloud changes...",
                tone: "pending",
              });
              continue;
            } catch (retryError) {
              error = retryError;
            }
          }

          conflictRetries = 0;
          console.error("Notes failed to save to account storage", error);
          showSaveStatus({
            label: "Cloud save failed - saved locally",
            tone: "error",
            title: error instanceof Error ? error.message : undefined,
          });
        }
      }
    } finally {
      cloudSaveRunningRef.current = false;

      // A newer edit may have arrived after the loop observed an empty queue.
      if (pendingCloudSaveRef.current) {
        void drainCloudSaveQueue();
      }
    }
  }, [applyLoadedNotes, showSaveStatus]);

  const queueCloudSave = React.useCallback(
    (payload: NotesPayload) => {
      pendingCloudSaveRef.current = payload;
      void drainCloudSaveQueue();
    },
    [drainCloudSaveQueue],
  );

  React.useEffect(() => {
    if (!hydratedRef.current || !notes.length || !activeId) return;

    const payload = { notes, activeId };
    const fingerprint = JSON.stringify(payload);

    if (skipCloudSaveFingerprintRef.current === fingerprint) {
      skipCloudSaveFingerprintRef.current = null;
      return;
    }
    skipCloudSaveFingerprintRef.current = null;

    if (cloudSaveTimerRef.current) {
      window.clearTimeout(cloudSaveTimerRef.current);
    }

    showSaveStatus({ label: "Saving...", tone: "pending" });
    cloudSaveTimerRef.current = window.setTimeout(() => {
      cloudSaveTimerRef.current = null;
      queueCloudSave(payload);
    }, 700);

    return () => {
      if (cloudSaveTimerRef.current) {
        window.clearTimeout(cloudSaveTimerRef.current);
        cloudSaveTimerRef.current = null;
      }
    };
  }, [activeId, notes, queueCloudSave, showSaveStatus]);

  const saveCurrentNote = React.useCallback(() => {
    const currentActiveId = activeIdRef.current;
    if (!currentActiveId) return;

    const editorHtml = editorRef.current?.innerHTML || "<p></p>";
    const nextNotes = notesRef.current.map((note) =>
      note.id === currentActiveId ? { ...note, content: editorHtml } : note,
    );

    notesRef.current = nextNotes;
    setNotes(nextNotes);
    const payload = { notes: nextNotes, activeId: currentActiveId };
    writeLocalNotes(payload);

    if (cloudSaveTimerRef.current) {
      window.clearTimeout(cloudSaveTimerRef.current);
      cloudSaveTimerRef.current = null;
    }
    skipCloudSaveFingerprintRef.current = JSON.stringify(payload);
    queueCloudSave(payload);
  }, [queueCloudSave]);

  React.useEffect(() => {
    function handleSaveShortcut(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey)) return;
      if (event.key.toLowerCase() !== "s") return;

      event.preventDefault();
      saveCurrentNote();
    }

    window.addEventListener("keydown", handleSaveShortcut);
    return () => window.removeEventListener("keydown", handleSaveShortcut);
  }, [saveCurrentNote]);

  function addNote() {
    const next = createNote(notes.length + 1);
    setNotes((prev) => [...prev, next]);
    setActiveId(next.id);
  }

  function renameNote(id: string, title: string) {
    setNotes((prev) =>
      prev.map((note) => (note.id === id ? { ...note, title } : note)),
    );
  }

  function deleteNote(id: string) {
    setNotes((prev) => {
      if (prev.length <= 1) {
        const fresh = createNote(1);
        setActiveId(fresh.id);
        return [fresh];
      }

      const idx = prev.findIndex((note) => note.id === id);
      const next = prev.filter((note) => note.id !== id);
      const fallback = next[Math.max(0, idx - 1)] ?? next[0];

      if (activeId === id) setActiveId(fallback.id);
      return next;
    });
  }

  function updateActiveContent(html: string) {
    if (!activeNote) return;
    setNotes((prev) =>
      prev.map((note) =>
        note.id === activeNote.id ? { ...note, content: html } : note,
      ),
    );
  }

  function runCommand(command: Command | "undo" | "redo") {
    editorRef.current?.focus();
    document.execCommand(command);
    updateActiveContent(editorRef.current?.innerHTML || "<p></p>");
  }

  function setBlock(block: "p" | "h1" | "h2" | "h3") {
    editorRef.current?.focus();
    document.execCommand("formatBlock", false, block);
    updateActiveContent(editorRef.current?.innerHTML || "<p></p>");
  }

  if (!activeNote) {
    return <div className="lo-notes">Loading notes...</div>;
  }

  return (
    <div className="lo-notes">
      <div className="lo-notes__tabs">
        <NotesMenu
          notes={notes}
          activeId={activeId}
          onOpenNote={setActiveId}
          onAddNote={addNote}
          onRenameNote={renameNote}
          onDeleteNote={deleteNote}
        />
      </div>

      <div className="lo-notebar">
        <select
          className="lo-notebar__select"
          defaultValue="p"
          onChange={(event) => setBlock(event.target.value as "p" | "h1" | "h2" | "h3")}
          title="Text style"
          aria-label="Text style"
        >
          <option value="p">Paragraph</option>
          <option value="h1">Heading 1</option>
          <option value="h2">Heading 2</option>
          <option value="h3">Heading 3</option>
        </select>

        <ToolbarButton label="Bold" onClick={() => runCommand("bold")}>
          <strong>B</strong>
        </ToolbarButton>

        <ToolbarButton label="Italic" onClick={() => runCommand("italic")}>
          <em>I</em>
        </ToolbarButton>

        <ToolbarButton
          label="Bulleted list"
          onClick={() => runCommand("insertUnorderedList")}
          icon="/icons/notes/list.png"
        />

        <ToolbarButton
          label="Numbered list"
          onClick={() => runCommand("insertOrderedList")}
          icon="/icons/notes/number-list.png"
        />

        <ToolbarButton
          label="Undo"
          onClick={() => runCommand("undo")}
          icon="/icons/notes/undo.png"
        />

        <ToolbarButton
          label="Redo"
          onClick={() => runCommand("redo")}
          icon="/icons/notes/redo.png"
        />
      </div>

      <div className="lo-notes__meta">
        <input
          className="lo-notes__titleinput"
          value={activeNote.title}
          onChange={(event) => renameNote(activeNote.id, event.target.value)}
          placeholder="Note title"
          title="Note title"
          aria-label="Note title"
        />
        {saveStatus ? (
          <span
            className={`lo-notes__save-status is-${saveStatus.tone}`}
            role="status"
            title={saveStatus.title}
          >
            {saveStatus.label}
          </span>
        ) : null}
      </div>

      <div className="lo-notes__editor">
        <div
          ref={editorRef}
          className="lo-notes__content"
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-label="Note content"
          onInput={(event) =>
            updateActiveContent(event.currentTarget.innerHTML || "<p></p>")
          }
          onBlur={(event) =>
            updateActiveContent(event.currentTarget.innerHTML || "<p></p>")
          }
        />
      </div>
    </div>
  );
}
