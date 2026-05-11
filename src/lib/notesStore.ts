export type NoteTab = {
  id: string;
  title: string;
  content: string;
};

export type NotesPayload = {
  notes: NoteTab[];
  activeId: string;
};

const STORAGE_KEY = "lifeos_notes_v1";
const ACTIVE_KEY = "lifeos_notes_active_v1";

export function makeNoteId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `note_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createNote(index: number): NoteTab {
  return {
    id: makeNoteId(),
    title: `Note ${index}`,
    content: "<p></p>",
  };
}

export function createQuickNote(body: string): NoteTab {
  const title = body.trim().split(/\s+/).slice(0, 5).join(" ");

  return {
    id: makeNoteId(),
    title: title || "Quick note",
    content: `<p>${escapeHtml(body.trim())}</p>`,
  };
}

export function readLocalNotes(): NotesPayload {
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
      ? parsed.filter(isNoteTab)
      : [];

    const safeNotes = notes.length ? notes : [fallbackNote];
    const safeActiveId =
      typeof rawActiveId === "string" &&
      safeNotes.some((note) => note.id === rawActiveId)
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

export function writeLocalNotes(payload: NotesPayload) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload.notes));
    localStorage.setItem(ACTIVE_KEY, payload.activeId);
  } catch {}
}

function isNoteTab(note: unknown): note is NoteTab {
  return (
    !!note &&
    typeof note === "object" &&
    "id" in note &&
    "title" in note &&
    "content" in note &&
    typeof note.id === "string" &&
    typeof note.title === "string" &&
    typeof note.content === "string"
  );
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
