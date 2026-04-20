import type { Handler } from "@netlify/functions";
import {
  errorResponse,
  extractClientResource,
  getRevisionFromRequest,
  jsonResponse,
  methodNotAllowed,
  parseJsonBody,
  readResource,
  requireUserId,
  writeResource,
  envelopeHeaders,
} from "./_lib/backend";
import {
  normalizeTasksResource,
  validateTasksResource,
} from "./_lib/validation";

export const handler: Handler = async (event, context) => {
  try {
    const userId = requireUserId(context);
    const key = `tasks/${userId}.json`;
    const current = await readResource({
      key,
      fallback: [] as ReturnType<typeof normalizeTasksResource>,
      normalize: normalizeTasksResource,
    });

    if (event.httpMethod === "GET") {
      return jsonResponse(200, current.resource, envelopeHeaders(current));
    }

    if (event.httpMethod === "POST") {
      const body = parseJsonBody(event);
      const resource = validateTasksResource(extractClientResource(body));
      const expectedRevision = getRevisionFromRequest(event, body);
      const next = await writeResource({
        key,
        current,
        expectedRevision,
        resource,
      });

      return jsonResponse(200, {
        ok: true,
        meta: {
          version: next.version,
          revision: next.revision,
          updatedAt: next.updatedAt,
        },
      }, envelopeHeaders(next));
    }

    return methodNotAllowed(["GET", "POST"]);
  } catch (error) {
    return errorResponse(error);
  }
};
