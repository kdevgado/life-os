import type { Handler } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

export const handler: Handler = async (event, context) => {
  const user = context.clientContext?.user;
  if (!user?.sub) {
    return { statusCode: 401, body: "Unauthorized" };
  }

  const store = getStore({
    name: "lifeos",
    siteID: process.env.NETLIFY_SITE_ID!,
    token: process.env.NETLIFY_AUTH_TOKEN!,
  });

  const key = `planner/${user.sub}.json`;

  if (event.httpMethod === "GET") {
    const data = await store.get(key, { type: "json" }).catch(() => null);
    return {
      statusCode: 200,
      body: JSON.stringify(data ?? []),
    };
  }

  if (event.httpMethod === "POST") {
    const body = event.body ? JSON.parse(event.body) : [];
    await store.setJSON(key, body);
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  }

  return { statusCode: 405, body: "Method not allowed" };
};