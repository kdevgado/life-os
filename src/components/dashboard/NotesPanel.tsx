import React from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { createPortal } from "react-dom";
import { getJwt, onAuthChange } from "../../lib/identity";
import {
  EMPTY_RESOURCE_META,
  fetchAuthedResource,
  ResourceApiError,
  saveAuthedResource,
  type ResourceMeta,
} from "../../lib/resourceApi";

type NoteTab = {
  id: string;
  title: string;
  content: string;
};

type NotesPayload = {
  notes: NoteTab[];
  activeId: string;
};

type SlashCommand = "paragraph" | "h1" | "h2" | "h3" | "bullet" | "number";

const STORAGE_KEY = "lifeos_notes_v1";
const ACTIVE_KEY = "lifeos_notes_active_v1";

const SLASH_ITEMS: Array<{ label: string; type: SlashCommand }> = [
  { label: "Paragraph", type: "paragraph" },
  { label: "Heading 1", type: "h1" },
  { label: "Heading 2", type: "h2" },
  { label: "Heading 3", type: "h3" },
  { label: "Bulleted list", type: "bullet" },
  { label: "Numbered list", type: "number" },
];

function readLocalNotes(): NotesPayload {
  try {
    const rawNotes = localStorage.getItem(STORAGE_KEY);
    const rawActiveId = localStorage.getItem(ACTIVE_KEY);

    const fallbackNote = createNote(1);

    if (!rawNotes) {
      return {
        notes: [fallbackNote],
        activeId: fallbackNote.id,
      };
    }

    const parsed = JSON.parse(rawNotes);
    const notes = Array.isArray(parsed)
      ? parsed.filter(
          (n) =>
            n &&
            typeof n.id === "string" &&
            typeof n.title === "string" &&
            typeof n.content === "string",
        )
      : [];

    const safeNotes = notes.length ? notes : [fallbackNote];
    const safeActiveId =
      typeof rawActiveId === "string" &&
      safeNotes.some((n) => n.id === rawActiveId)
        ? rawActiveId
        : safeNotes[0].id;

    return {
      notes: safeNotes,
      activeId: safeActiveId,
    };
  } catch {
    const fallbackNote = createNote(1);
    return {
      notes: [fallbackNote],
      activeId: fallbackNote.id,
    };
  }
}

function writeLocalNotes(payload: NotesPayload) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload.notes));
    localStorage.setItem(ACTIVE_KEY, payload.activeId);
  } catch {}
}

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

    document.addEventListener("pointerdown", handlePointerDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [open]);

  return (
    <div className="lo-notes-menu" ref={menuRef}>
      <button
        type="button"
        className="lo-dropdown-trigger lo-notes-menu__trigger"
        onClick={(e) => {
          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();

          setMenuPos({
            top: rect.bottom + 8,
            right: Math.max(12, window.innerWidth - rect.right),
          });
          setOpen((v) => !v);
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
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

function getSlashMatch(editor: {
  state: {
    selection: { from: number };
    doc: {
      textBetween: (
        from: number,
        to: number,
        blockSeparator?: string,
        leafText?: string,
      ) => string;
    };
  };
}) {
  const { from } = editor.state.selection;
  const textBefore = editor.state.doc.textBetween(
    Math.max(0, from - 50),
    from,
    "\n",
    "\n",
  );

  // match "/something" only at the end of the current text before cursor
  const match = textBefore.match(/(?:^|\s)\/([^\s]*)$/);
  if (!match) return null;

  const query = match[1] ?? "";
  const fullMatch = match[0];
  const slashOffset = fullMatch.lastIndexOf("/");
  const slashFrom =
    from -
    (textBefore.length - (textBefore.length - fullMatch.length + slashOffset));

  return {
    query,
    slashFrom,
    from,
  };
}

export default function NotesPanel() {
  const [notes, setNotes] = React.useState<NoteTab[]>([]);
  const [activeId, setActiveId] = React.useState<string>("");
  const [slashOpen, setSlashOpen] = React.useState(false);
  const [slashPos, setSlashPos] = React.useState({ top: 0, left: 0 });
  const [isEditorScrolled, setIsEditorScrolled] = React.useState(false);
  const editorWrapRef = React.useRef<HTMLDivElement | null>(null);
  const [isMounted, setIsMounted] = React.useState(false);
  const [slashIndex, setSlashIndex] = React.useState(0);
  const [syncNotice, setSyncNotice] = React.useState<string | null>(null);
  const slashOpenRef = React.useRef(false);
  const slashIndexRef = React.useRef(0);
  const serverMetaRef = React.useRef<ResourceMeta>(EMPTY_RESOURCE_META);

  const [slashItems, setSlashItems] =
    React.useState<Array<{ label: string; type: SlashCommand }>>(SLASH_ITEMS);

  const slashItemsRef = React.useRef(SLASH_ITEMS);

  const noteActions = React.useMemo(
    () => ({
      add() {
        const next = createNote(notes.length + 1);
        setNotes((prev) => [...prev, next]);
        setActiveId(next.id);
      },

      rename(id: string, title: string) {
        setNotes((prev) =>
          prev.map((n) => (n.id === id ? { ...n, title } : n)),
        );
      },

      remove(id: string) {
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
      },
    }),
    [notes, activeId],
  );

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
    slashItemsRef.current = slashItems;
  }, [slashItems]);

  const ignoreNextSaveRef = React.useRef(false);
  const hydratedRef = React.useRef(false);

  const reloadNotes = React.useCallback(async () => {
    try {
      const jwt = await getJwt();
      setSyncNotice(null);

      ignoreNextSaveRef.current = true;

      if (!jwt) {
        serverMetaRef.current = EMPTY_RESOURCE_META;
        const local = readLocalNotes();
        setNotes(local.notes);
        setActiveId(local.activeId);
        return;
      }

      const { data: remote, meta } = await fetchAuthedResource<NotesPayload>(
        "/.netlify/functions/notes",
        jwt,
      );
      serverMetaRef.current = meta;
      const remoteNotes = Array.isArray(remote?.notes) ? remote.notes : [];
      const local = readLocalNotes();

      if (remoteNotes.length > 0) {
        const nextActiveId =
          typeof remote?.activeId === "string" &&
          remoteNotes.some((n: NoteTab) => n.id === remote.activeId)
            ? remote.activeId
            : (remoteNotes[0]?.id ?? "");

        setNotes(remoteNotes);
        setActiveId(nextActiveId);
        writeLocalNotes({
          notes: remoteNotes,
          activeId: nextActiveId,
        });
        return;
      }

      setNotes(local.notes);
      setActiveId(local.activeId);
    } catch {
      const local = readLocalNotes();
      setNotes(local.notes);
      setActiveId(local.activeId);
    }
  }, []);

  React.useEffect(() => {
    void reloadNotes();
  }, [reloadNotes]);

  React.useEffect(() => {
    let unsub: (() => void) | null = null;

    (async () => {
      unsub = await onAuthChange(() => {
        void reloadNotes();
      });
    })();

    return () => {
      if (unsub) unsub();
    };
  }, [reloadNotes]);

  React.useEffect(() => {
    if (!notes.length) return;
    writeLocalNotes({ notes, activeId });
  }, [notes, activeId]);

  const saveTimerRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    if (!notes.length) return;
    if (typeof window === "undefined") return;

    if (ignoreNextSaveRef.current) {
      ignoreNextSaveRef.current = false;
      hydratedRef.current = true;
      return;
    }

    if (!hydratedRef.current) {
      hydratedRef.current = true;
      return;
    }

    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = window.setTimeout(async () => {
      try {
        const jwt = await getJwt();

        if (!jwt) return;

        const { meta } = await saveAuthedResource(
          "/.netlify/functions/notes",
          jwt,
          {
            notes,
            activeId,
          },
          serverMetaRef.current,
        );

        serverMetaRef.current = meta;
        setSyncNotice(null);
      } catch (error) {
        if (error instanceof ResourceApiError && error.status === 409) {
          setSyncNotice(
            "Notes changed in another tab or device. Reloaded the latest version.",
          );
          void reloadNotes();
          return;
        }

        setSyncNotice(
          error instanceof Error
            ? error.message
            : "Notes could not sync right now. Your local copy is still saved on this device.",
        );
      }
    }, 700);

    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }
    };
  }, [notes, activeId, reloadNotes]);

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

  React.useEffect(() => {
    const editorWrap = editorWrapRef.current;
    if (!editorWrap) return;

    const handleScroll = () => {
      setIsEditorScrolled(editorWrap.scrollTop > 24);
    };

    handleScroll();
    editorWrap.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      editorWrap.removeEventListener("scroll", handleScroll);
    };
  }, [activeId]);

  function closeSlashMenu() {
    setSlashOpen(false);
    setSlashIndex(0);
    setSlashItems(SLASH_ITEMS);
    slashIndexRef.current = 0;
    slashItemsRef.current = SLASH_ITEMS;
  }

  const activeNote = React.useMemo(
    () => notes.find((n) => n.id === activeId) ?? notes[0] ?? null,
    [notes, activeId],
  );

  function updateSlashMenuState(view: {
    state: {
      selection: { from: number };
      doc: {
        textBetween: (
          from: number,
          to: number,
          blockSeparator?: string,
          leafText?: string,
        ) => string;
      };
    };
    coordsAtPos: (pos: number) => {
      top: number;
      bottom: number;
      left: number;
      right: number;
    };
  }) {
    const match = getSlashMatch(view);

    if (!match) {
      closeSlashMenu();
      return;
    }

    const query = match.query.toLowerCase();

    const nextItems = SLASH_ITEMS.filter((item) =>
      item.label.toLowerCase().includes(query),
    );

    if (!nextItems.length) {
      closeSlashMenu();
      return;
    }

    const coords = view.coordsAtPos(match.from);

    slashItemsRef.current = nextItems;
    slashIndexRef.current = 0;

    setSlashItems(nextItems);
    setSlashIndex(0);
    setSlashPos({
      top: coords.bottom + 6,
      left: coords.left,
    });
    setSlashOpen(true);
  }

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
              updateSlashMenuState(view);
            });
            return false;
          }

          if (!slashOpenRef.current) {
            return false;
          }

          if (event.key === "Escape") {
            event.preventDefault();
            closeSlashMenu();
            return true;
          }

          if (event.key === "Tab" || event.key === "ArrowDown") {
            event.preventDefault();
            const items = slashItemsRef.current;
            if (!items.length) return true;

            setSlashIndex((prev) => {
              const next = (prev + 1) % items.length;
              slashIndexRef.current = next;
              return next;
            });
            return true;
          }

          if (event.key === "ArrowUp") {
            event.preventDefault();
            const items = slashItemsRef.current;
            if (!items.length) return true;

            setSlashIndex((prev) => {
              const next = prev === 0 ? items.length - 1 : prev - 1;
              slashIndexRef.current = next;
              return next;
            });
            return true;
          }

          if (event.key === "Enter") {
            event.preventDefault();
            const items = slashItemsRef.current;
            const selected = items[slashIndexRef.current];
            if (!selected) return true;

            runSlashCommand(selected.type);
            return true;
          }

          // if user keeps typing after "/", close slash menu
          if (
            event.key.length === 1 &&
            event.key !== "/" &&
            !event.metaKey &&
            !event.ctrlKey &&
            !event.altKey
          ) {
            closeSlashMenu();
            return false;
          }

          if (event.key === "Backspace" || event.key === "Delete") {
            requestAnimationFrame(() => {
              updateSlashMenuState(view);
            });
            return false;
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

        if (slashOpenRef.current) {
          updateSlashMenuState(editor.view);
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

  React.useEffect(() => {
    if (!notes.length) return;
    if (!activeId || !notes.some((n) => n.id === activeId)) {
      setActiveId(notes[0].id);
    }
  }, [notes, activeId]);

  if (!activeNote || !editor) {
    return <div className="lo-notes">Loading notes{"\u2026"}</div>;
  }

  const textStyle = editor.isActive("heading", { level: 1 })
    ? "h1"
    : editor.isActive("heading", { level: 2 })
      ? "h2"
      : editor.isActive("heading", { level: 3 })
        ? "h3"
        : "p";

  function runSlashCommand(type: SlashCommand) {
    if (!editor) return;

    const match = getSlashMatch(editor);
    const chain = editor.chain().focus();

    if (match) {
      chain.deleteRange({ from: match.slashFrom, to: match.from });
    }

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

    closeSlashMenu();
  }

  return (
    <div className={`lo-notes ${isEditorScrolled ? "is-compact" : ""}`}>
      <div className="lo-notes__tabs">
        <NotesMenu
          notes={notes}
          activeId={activeId}
          onOpenNote={(id) => setActiveId(id)}
          onAddNote={noteActions.add}
          onRenameNote={noteActions.rename}
          onDeleteNote={noteActions.remove}
        />
      </div>

      {syncNotice ? <div className="muted">{syncNotice}</div> : null}

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
          onChange={(e) => noteActions.rename(activeNote.id, e.target.value)}
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
                  onClick={() => runSlashCommand(item.type)}
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
