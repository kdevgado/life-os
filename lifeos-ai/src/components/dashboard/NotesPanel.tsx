import React from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useClickOutside } from "../../lib/useClickOutside";
import Placeholder from "@tiptap/extension-placeholder";
import { createPortal } from "react-dom";

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
    content: "<p></p>",
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
        typeof n.content === "string",
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
  const [slashOpen, setSlashOpen] = React.useState(false);
  const [slashPos, setSlashPos] = React.useState({ top: 0, left: 0 });
  const editorWrapRef = React.useRef<HTMLDivElement | null>(null);
  const [isMounted, setIsMounted] = React.useState(false);
  const [slashIndex, setSlashIndex] = React.useState(0);
  const slashOpenRef = React.useRef(false);
  const slashIndexRef = React.useRef(0);

  const slashItems = [
    { label: "Paragraph", type: "paragraph" },
    { label: "Heading 1", type: "h1" },
    { label: "Heading 2", type: "h2" },
    { label: "Heading 3", type: "h3" },
    { label: "Bulleted list", type: "bullet" },
    { label: "Numbered list", type: "number" },
  ];

  React.useEffect(() => {
    slashOpenRef.current = slashOpen;
  }, [slashOpen]);

  React.useEffect(() => {
    slashIndexRef.current = slashIndex;
  }, [slashIndex]);

  React.useEffect(() => {
    setIsMounted(true);
  }, []);

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

  React.useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as HTMLElement;
      if (
        target.closest(".lo-notes-slash") ||
        target.closest(".lo-notes__content")
      ) {
        return;
      }
      setSlashOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  function openSlashMenu(
    view: Parameters<
      NonNullable<typeof editor>["view"]["coordsAtPos"]
    >[0] extends never
      ? never
      : any,
  ) {
    const { from } = view.state.selection;
    const coords = view.coordsAtPos(from);

    setSlashPos({
      top: coords.bottom + 6,
      left: coords.left,
    });
    setSlashIndex(0);
    setSlashOpen(true);
  }

  function closeSlashMenu() {
    setSlashOpen(false);
    setSlashIndex(0);
  }

  const activeNote = React.useMemo(
    () => notes.find((n) => n.id === activeId) ?? notes[0] ?? null,
    [notes, activeId],
  );

  const editor = useEditor(
    {
      extensions: [
        StarterKit,
        Placeholder.configure({
          placeholder: "Start typing your note...",
          emptyEditorClass: "is-editor-empty",
        }),
      ],
      immediatelyRender: false,
      content: activeNote?.content ?? "<p></p>",
      editorProps: {
        handleKeyDown(view, event) {
          if (event.key === "/") {
            requestAnimationFrame(() => {
              const { from } = view.state.selection;
              const coords = view.coordsAtPos(from);

              setSlashPos({
                top: coords.bottom + 6,
                left: coords.left,
              });
              setSlashIndex(0);
              setSlashOpen(true);
            });
            return false;
          }

          if (event.key === "Escape" && slashOpenRef.current) {
            event.preventDefault();
            closeSlashMenu();
            return true;
          }

          if (slashOpenRef.current) {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setSlashIndex((prev) => {
                const next = (prev + 1) % slashItems.length;
                slashIndexRef.current = next;
                return next;
              });
              return true;
            }

            if (event.key === "ArrowUp") {
              event.preventDefault();
              setSlashIndex((prev) => {
                const next = prev === 0 ? slashItems.length - 1 : prev - 1;
                slashIndexRef.current = next;
                return next;
              });
              return true;
            }

            if (event.key === "Enter") {
              event.preventDefault();
              const item = slashItems[slashIndexRef.current];
              if (item) {
                runSlashCommand(
                  item.type as
                    | "paragraph"
                    | "h1"
                    | "h2"
                    | "h3"
                    | "bullet"
                    | "number",
                );
              }
              return true;
            }
          }

          return false;
        },
      },
      onUpdate: ({ editor }) => {
        if (!activeNote) return;

        const html = editor.getHTML();
        setNotes((prev) =>
          prev.map((n) =>
            n.id === activeNote.id ? { ...n, content: html } : n,
          ),
        );

        const { from } = editor.state.selection;
        const textBefore = editor.state.doc.textBetween(
          Math.max(0, from - 20),
          from,
          "\n",
          "\n",
        );

        if (slashOpenRef.current && !textBefore.includes("/")) {
          closeSlashMenu();
        }
      },
    },
    [activeNote?.id],
  );

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

  function runSlashCommand(
    type: "paragraph" | "h1" | "h2" | "h3" | "bullet" | "number",
  ) {
    if (!editor) return;

    const { state } = editor;
    const { from } = state.selection;

    const textBefore = state.doc.textBetween(
      Math.max(0, from - 20),
      from,
      "\n",
      "\n",
    );

    const slashIndex = textBefore.lastIndexOf("/");

    if (slashIndex !== -1) {
      const slashFrom = from - (textBefore.length - slashIndex);
      editor.chain().focus().deleteRange({ from: slashFrom, to: from }).run();
    }

    const chain = editor.chain().focus();

    switch (type) {
      case "paragraph":
        chain.setParagraph().run();
        break;
      case "h1":
        chain.setHeading({ level: 1 }).run();
        break;
      case "h2":
        chain.setHeading({ level: 2 }).run();
        break;
      case "h3":
        chain.setHeading({ level: 3 }).run();
        break;
      case "bullet":
        chain.toggleBulletList().run();
        break;
      case "number":
        chain.toggleOrderedList().run();
        break;
    }

    setSlashOpen(false);
  }

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

      <div
        ref={editorWrapRef}
        className="lo-notes__editor"
        onMouseDown={(e) => {
          if (!editor) return;

          const target = e.target as HTMLElement;
          if (
            target.closest(".lo-notes-slash") ||
            target.closest(".lo-notebar") ||
            target.closest(".lo-notes__titleinput")
          ) {
            return;
          }

          const clickedInsideContent = !!target.closest(".lo-notes__content");
          const isEmpty = editor.isEmpty;

          if (clickedInsideContent && !isEmpty) {
            return;
          }

          if (isEmpty) {
            e.preventDefault();
            editor.chain().focus("end").run();
          }
        }}
      >
        <EditorContent editor={editor} className="lo-notes__content" />

        {isMounted &&
          slashOpen &&
          createPortal(
            <div
              className="lo-notes-slash"
              style={{
                top: slashPos.top,
                left: slashPos.left,
              }}
            >
              {slashItems.map((item, index) => (
                <button
                  key={item.type}
                  type="button"
                  className={index === slashIndex ? "is-active" : ""}
                  onMouseEnter={() => setSlashIndex(index)}
                  onClick={() =>
                    runSlashCommand(
                      item.type as
                        | "paragraph"
                        | "h1"
                        | "h2"
                        | "h3"
                        | "bullet"
                        | "number",
                    )
                  }
                >
                  {item.label}
                </button>
              ))}
            </div>,
            document.body,
          )}
      </div>
    </div>
  );
}
