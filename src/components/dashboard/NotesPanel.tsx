import React from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useClickOutside } from "./useClickOutside";

type NoteTab = {
  id: string;
  title: string;
  content: string;
};

const STORAGE_KEY = "lifeos_notes_v1";
const ACTIVE_KEY = "lifeos_notes_active_v1";

function makeId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `note_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function createNote(index: number): NoteTab {
  return {
    id: makeId(),
    title: `Note ${index}`,
    content: "<h2>New note</h2><p>Start writing here...</p>",
  };
}

function loadNotes(): NoteTab[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [createNote(1)];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return [createNote(1)];

    const clean = parsed.filter(
      (n) =>
        n &&
        typeof n.id === "string" &&
        typeof n.title === "string" &&
        typeof n.content === "string"
    );

    return clean.length ? clean : [createNote(1)];
  } catch {
    return [createNote(1)];
  }
}

function loadActiveId(notes: NoteTab[]): string {
  try {
    const saved = localStorage.getItem(ACTIVE_KEY);
    if (saved && notes.some((n) => n.id === saved)) return saved;
  } catch {}
  return notes[0].id;
}

function ToolbarButton({
  label,
  active = false,
  onClick,
  icon,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  icon?: string;
  children?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={`lo-notebar__btn ${active ? "is-active" : ""}`}
      onClick={onClick}
      title={label}
      aria-label={label}
    >
      {icon ? (
        <img src={icon} alt="" className="lo-notebar__icon" />
      ) : (
        children
      )}
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

  const menuRef = useClickOutside<HTMLDivElement>(() => {
    setOpen(false);
    setHoveredId(null);
  }, open);

  return (
    <div className="lo-notes-menu" ref={menuRef}>
      <button
        type="button"
        className="lo-notes-menu__trigger"
        onClick={() => setOpen((v) => !v)}
        title="Manage notes"
        aria-label="Manage notes"
      >
        Notes ▾
      </button>

      {open && (
        <div className="lo-notes-menu__panel">
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
                onMouseLeave={() => setHoveredId((id) => (id === note.id ? null : id))}
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

                {hoveredId === note.id && (
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
                        if (ok) {
                          onDeleteNote(note.id);
                        }
                      }}
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function NotesPanel() {
  const [notes, setNotes] = React.useState<NoteTab[]>([]);
  const [activeId, setActiveId] = React.useState<string>("");

  React.useEffect(() => {
    const loaded = loadNotes();
    setNotes(loaded);
    setActiveId(loadActiveId(loaded));
  }, []);

  React.useEffect(() => {
    if (!notes.length) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
    } catch {}
  }, [notes]);

  React.useEffect(() => {
    if (!activeId) return;
    try {
      localStorage.setItem(ACTIVE_KEY, activeId);
    } catch {}
  }, [activeId]);

  const activeNote = React.useMemo(
    () => notes.find((n) => n.id === activeId) ?? notes[0] ?? null,
    [notes, activeId]
  );

  const editor = useEditor({
    extensions: [StarterKit],
    immediatelyRender: false,
    content: activeNote?.content ?? "<p></p>",
    onUpdate: ({ editor }) => {
      if (!activeNote) return;
      const html = editor.getHTML();
      setNotes((prev) =>
        prev.map((n) => (n.id === activeNote.id ? { ...n, content: html } : n))
      );
    },
  });

  React.useEffect(() => {
    if (!editor || !activeNote) return;
    const current = editor.getHTML();
    if (current !== activeNote.content) {
      editor.commands.setContent(activeNote.content);
    }
  }, [editor, activeNote]);

  function addNote() {
    const next = createNote(notes.length + 1);
    setNotes((prev) => [...prev, next]);
    setActiveId(next.id);
  }

  function renameNote(id: string, title: string) {
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, title } : n)));
  }

  function deleteNoteById(id: string) {
  const target = notes.find((n) => n.id === id);
  if (!target) return;

  if (notes.length === 1) {
    const fresh = createNote(1);
    setNotes([fresh]);
    setActiveId(fresh.id);
    return;
  }

  const idx = notes.findIndex((n) => n.id === id);
  const nextNotes = notes.filter((n) => n.id !== id);
  const fallback = nextNotes[Math.max(0, idx - 1)] ?? nextNotes[0];

  setNotes(nextNotes);

  if (activeId === id) {
    setActiveId(fallback.id);
  }
}

function deleteCurrentNoteById(id: string) {
  deleteNoteById(id);
}

  if (!activeNote || !editor) {
    return <div className="lo-notes">Loading notes…</div>;
  }

  const textStyle = editor.isActive("heading", { level: 1 })
    ? "h1"
    : editor.isActive("heading", { level: 2 })
    ? "h2"
    : editor.isActive("heading", { level: 3 })
    ? "h3"
    : "p";

  return (
    <div className="lo-notes">
      <div className="lo-notes__tabs">
        <div className="lo-notes__tablist">
          {notes.map((note) => (
            <button
              key={note.id}
              type="button"
              className={`lo-notes__tab ${note.id === activeId ? "is-active" : ""}`}
              onClick={() => setActiveId(note.id)}
              title={note.title}
              aria-label={`Open ${note.title}`}
            >
              {note.title}
            </button>
          ))}
        </div>

        <NotesMenu
            notes={notes}
            activeId={activeId}
            onOpenNote={(id) => setActiveId(id)}
            onAddNote={addNote}
            onRenameNote={renameNote}
            onDeleteNote={deleteCurrentNoteById}
            />
      </div>

      <div className="lo-notebar">
        <select
            className="lo-notebar__select"
            value={textStyle}
            onChange={(e) => {
            const value = e.target.value;
            if (value === "p") {
                editor.chain().focus().setParagraph().run();
            } else {
                const level = Number(value.replace("h", "")) as 1 | 2 | 3;
                editor.chain().focus().setHeading({ level }).run();
            }
            }}
            title="Text style"
            aria-label="Text style"
        >
            <option value="p">Paragraph</option>
            <option value="h1">Heading 1</option>
            <option value="h2">Heading 2</option>
            <option value="h3">Heading 3</option>
        </select>

        <ToolbarButton
            label="Bold"
            active={editor.isActive("bold")}
            onClick={() => editor.chain().focus().toggleBold().run()}
        >
            <strong>B</strong>
        </ToolbarButton>

        <ToolbarButton
            label="Italic"
            active={editor.isActive("italic")}
            onClick={() => editor.chain().focus().toggleItalic().run()}
        >
            <em>I</em>
        </ToolbarButton>

        <ToolbarButton
            label="Bulleted list"
            active={editor.isActive("bulletList")}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            icon="/icons/notes/list.png"
        />

        <ToolbarButton
            label="Numbered list"
            active={editor.isActive("orderedList")}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            icon="/icons/notes/number-list.png"
        />

        <ToolbarButton
            label="Undo"
            onClick={() => editor.chain().focus().undo().run()}
            icon="/icons/notes/undo.png"
        />

        <ToolbarButton
            label="Redo"
            onClick={() => editor.chain().focus().redo().run()}
            icon="/icons/notes/redo.png"
        />
        </div>

      <div className="lo-notes__meta">
        <input
          className="lo-notes__titleinput"
          value={activeNote.title}
          onChange={(e) => renameNote(activeNote.id, e.target.value)}
          placeholder="Note title"
          title="Note title"
          aria-label="Note title"
        />
      </div>

      <div className="lo-notes__editor">
        <EditorContent editor={editor} className="lo-notes__content" />
      </div>
    </div>
  );
}