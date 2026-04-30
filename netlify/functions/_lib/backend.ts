import { getStore } from "@netlify/blobs";
import type { HandlerContext, HandlerEvent, HandlerResponse } from "@netlify/functions";

export type ResourceEnvelope<T> = {
  version: 1;
  updatedAt: string;
  revision: number;
  resource: T;
};

export class HttpError extends Error {
  statusCode: number;
  code: string;
  details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export function jsonResponse(
  statusCode: number,
  payload: unknown,
  headers: Record<string, string> = {},
): HandlerResponse {
  return {
    statusCode,
    body: JSON.stringify(payload),
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...headers,
    },
  };
}

export function errorResponse(error: unknown): HandlerResponse {
  if (error instanceof HttpError) {
    return jsonResponse(error.statusCode, {
      ok: false,
      error: {
        code: error.code,
        message: error.message,
        details: error.details ?? null,
      },
    });
  }

  return jsonResponse(500, {
    ok: false,
    error: {
      code: "internal_error",
      message: error instanceof Error ? error.message : "Unexpected server error",
    },
  });
}

export function methodNotAllowed(allowed: string[]): HandlerResponse {
  return jsonResponse(405, {
    ok: false,
    error: {
      code: "method_not_allowed",
      message: "Method not allowed",
      details: { allowed },
    },
  }, {
    Allow: allowed.join(", "),
  });
}

export function requireUserId(context: HandlerContext): string {
  const userId = context.clientContext?.user?.sub;

  if (!userId) {
    throw new HttpError(401, "unauthorized", "Authentication required");
  }

  return userId;
}

export function parseJsonBody(event: HandlerEvent): unknown {
  if (!event.body) return undefined;

  try {
    return JSON.parse(event.body);
  } catch {
    throw new HttpError(400, "invalid_json", "Request body must be valid JSON");
  }
}

export function getRevisionFromRequest(event: HandlerEvent, body: unknown): number | null {
  const headerValue =
    event.headers["x-lifeos-revision"] ??
    event.headers["X-LifeOS-Revision"] ??
    event.headers["if-match"] ??
    event.headers["If-Match"];

  const parsedHeader = parseOptionalInteger(headerValue);
  if (parsedHeader !== null) return parsedHeader;

  if (body && typeof body === "object") {
    const candidate =
      (body as { meta?: { revision?: unknown }; revision?: unknown }).meta?.revision ??
      (body as { revision?: unknown }).revision;

    return parseOptionalInteger(candidate);
  }

  return null;
}

export function extractClientResource<T>(body: unknown): T {
  if (isEnvelope(body)) {
    return body.resource as T;
  }

  return body as T;
}

export function envelopeHeaders<T>(envelope: ResourceEnvelope<T>): Record<string, string> {
  return {
    "X-LifeOS-Version": String(envelope.version),
    "X-LifeOS-Revision": String(envelope.revision),
    "X-LifeOS-Updated-At": envelope.updatedAt,
  };
}

export async function readResource<T>(args: {
  key: string;
  fallback: T;
  normalize: (raw: unknown) => T;
}): Promise<ResourceEnvelope<T>> {
  const store = getLifeOsStore();
  const raw = await store.get(args.key, { type: "json" }).catch(() => null);

  if (isEnvelope(raw)) {
    return {
      version: 1,
      revision: toNonNegativeInteger(raw.revision, 0),
      updatedAt: normalizeIsoTimestamp(raw.updatedAt),
      resource: args.normalize(raw.resource),
    };
  }

  return {
    version: 1,
    revision: 0,
    updatedAt: new Date(0).toISOString(),
    resource: args.normalize(raw ?? args.fallback),
  };
}

export async function writeResource<T>(args: {
  key: string;
  current: ResourceEnvelope<T>;
  expectedRevision: number | null;
  resource: T;
}): Promise<ResourceEnvelope<T>> {
  if (
    args.expectedRevision !== null &&
    args.expectedRevision !== args.current.revision
  ) {
    throw new HttpError(409, "revision_conflict", "Resource has changed since the client last read it", {
      expectedRevision: args.expectedRevision,
      currentRevision: args.current.revision,
      updatedAt: args.current.updatedAt,
    });
  }

  const next: ResourceEnvelope<T> = {
    version: 1,
    revision: args.current.revision + 1,
    updatedAt: new Date().toISOString(),
    resource: args.resource,
  };

  const store = getLifeOsStore();
  await store.setJSON(args.key, next);
  return next;
}

function getLifeOsStore() {
  const siteID = process.env.NETLIFY_SITE_ID;
  const token = process.env.NETLIFY_AUTH_TOKEN;

  if (siteID && token) {
    return getStore({
      name: "lifeos",
      siteID,
      token,
    });
  }

  return getStore("lifeos");
}

function isEnvelope(value: unknown): value is ResourceEnvelope<unknown> {
  if (!value || typeof value !== "object") return false;

  const candidate = value as Partial<ResourceEnvelope<unknown>>;
  return (
    candidate.version === 1 &&
    typeof candidate.updatedAt === "string" &&
    typeof candidate.revision === "number" &&
    "resource" in candidate
  );
}

function parseOptionalInteger(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new HttpError(400, "invalid_revision", "Revision must be a non-negative integer");
  }
  return parsed;
}

function toNonNegativeInteger(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

export function normalizeIsoTimestamp(value: unknown, fallback = new Date().toISOString()): string {
  if (typeof value !== "string") return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

export function ensureRecord(value: unknown, code: string, message: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpError(400, code, message);
  }

  return value as Record<string, unknown>;
}

export function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

export function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function asFiniteNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function asNonNegativeNumber(value: unknown, fallback = 0): number {
  return Math.max(0, asFiniteNumber(value, fallback));
}

export function clampInteger(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = Math.round(asFiniteNumber(value, fallback));
  return Math.min(max, Math.max(min, parsed));
}

export function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const result: string[] = [];

  for (const entry of value) {
    if (typeof entry !== "string") continue;
    if (seen.has(entry)) continue;
    seen.add(entry);
    result.push(entry);
  }

  return result;
}

export function generateId(prefix: string): string {
  return `${prefix}_${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
}
