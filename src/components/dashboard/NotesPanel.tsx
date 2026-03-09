import React from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

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
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={`lo-notebar__btn ${active ? "is-active" : ""}`}
      onClick={onClick}
      title={label}
      aria-label={label}
    >
      {children}
    </button>
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

  function deleteCurrentNote() {
    if (!activeNote) return;
    if (notes.length === 1) {
      const fresh = createNote(1);
      setNotes([fresh]);
      setActiveId(fresh.id);
      return;
    }

    const idx = notes.findIndex((n) => n.id === activeNote.id);
    const nextNotes = notes.filter((n) => n.id !== activeNote.id);
    const fallback = nextNotes[Math.max(0, idx - 1)] ?? nextNotes[0];

    setNotes(nextNotes);
    setActiveId(fallback.id);
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

        <div className="lo-notes__tabactions">
          <button
            type="button"
            className="lo-notes__newtab"
            onClick={addNote}
            title="New note"
            aria-label="New note"
          >
            +
          </button>

          <button
            type="button"
            className="lo-notes__newtab"
            onClick={deleteCurrentNote}
            title="Delete current note"
            aria-label="Delete current note"
          >
            −
          </button>
        </div>
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
        >
          • List
        </ToolbarButton>

        <ToolbarButton
          label="Undo"
          onClick={() => editor.chain().focus().undo().run()}
        >
          Undo
        </ToolbarButton>

        <ToolbarButton
          label="Redo"
          onClick={() => editor.chain().focus().redo().run()}
        >
          Redo
        </ToolbarButton>
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