import React from "react";
import { createPortal } from "react-dom";
import {
  createNote,
  readLocalNotes,
  writeLocalNotes,
  type NoteTab,
} from "../../lib/notesStore";

type Command = "bold" | "italic" | "insertUnorderedList" | "insertOrderedList";
const NOTES_DROPDOWN_ID = "notes-menu";

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
  const editorRef = React.useRef<HTMLDivElement | null>(null);
  const hydratedRef = React.useRef(false);

  React.useEffect(() => {
    const local = readLocalNotes();
    setNotes(local.notes);
    setActiveId(local.activeId);
    hydratedRef.current = true;
  }, []);

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
