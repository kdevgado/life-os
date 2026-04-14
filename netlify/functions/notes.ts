import type { Handler } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

type NoteTab = {
  id: string;
  title: string;
  content: string;
};

type NotesPayload = {
  notes: NoteTab[];
  activeId: string;
};

const EMPTY_PAYLOAD: NotesPayload = {
  notes: [],
  activeId: "",
};

export const handler: Handler = async (event, context) => {
  const user = context.clientContext?.user;

  if (!user?.sub) {
    return {
      statusCode: 401,
      body: "Unauthorized",
    };
  }

  const store = getStore({
    name: "lifeos",
    siteID: process.env.NETLIFY_SITE_ID!,
    token: process.env.NETLIFY_AUTH_TOKEN!,
  });

  const key = `notes/${user.sub}.json`;

  if (event.httpMethod === "GET") {
    try {
      const data = await store.get(key, { type: "json" });
      return {
        statusCode: 200,
        body: JSON.stringify(data ?? EMPTY_PAYLOAD),
      };
    } catch {
      return {
        statusCode: 200,
        body: JSON.stringify(EMPTY_PAYLOAD),
      };
    }
  }

  if (event.httpMethod === "POST") {
    try {
      const body = event.body ? JSON.parse(event.body) : EMPTY_PAYLOAD;
      await store.setJSON(key, {
        notes: Array.isArray(body?.notes) ? body.notes : [],
        activeId: typeof body?.activeId === "string" ? body.activeId : "",
      });

      return {
        statusCode: 200,
        body: JSON.stringify({ ok: true }),
      };
    } catch (error: any) {
      return {
        statusCode: 400,
        body: error?.message ?? "Invalid request body",
      };
    }
  }

  return {
    statusCode: 405,
    body: "Method not allowed",
  };
};