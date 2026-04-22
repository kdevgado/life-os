export type ResourceMeta = {
  version: number | null;
  revision: number | null;
  updatedAt: string | null;
};

export const EMPTY_RESOURCE_META: ResourceMeta = {
  version: null,
  revision: null,
  updatedAt: null,
};

type ApiErrorPayload = {
  ok?: boolean;
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
};

export class ResourceApiError extends Error {
  status: number;
  code?: string;
  details?: unknown;

  constructor(args: {
    status: number;
    message: string;
    code?: string;
    details?: unknown;
  }) {
    super(args.message);
    this.status = args.status;
    this.code = args.code;
    this.details = args.details;
  }
}

export async function fetchAuthedResource<T>(
  url: string,
  jwt: string,
): Promise<{ data: T; meta: ResourceMeta }> {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${jwt}`,
    },
  });

  const payload = await parseResponseBody<T>(res);

  if (!res.ok) {
    throw toResourceApiError(res.status, payload);
  }

  return {
    data: payload as T,
    meta: readResourceMeta(res),
  };
}

export async function saveAuthedResource<T>(
  url: string,
  jwt: string,
  resource: T,
  meta: ResourceMeta,
): Promise<{ meta: ResourceMeta }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${jwt}`,
  };

  if (meta.revision !== null) {
    headers["X-LifeOS-Revision"] = String(meta.revision);
  }

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(resource),
  });

  const payload = await parseResponseBody<{ meta?: Partial<ResourceMeta> }>(res);

  if (!res.ok) {
    throw toResourceApiError(res.status, payload);
  }

  return {
    meta: mergeMeta(readResourceMeta(res), payload?.meta),
  };
}

async function parseResponseBody<T>(res: Response): Promise<T | undefined> {
  const contentType = res.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    return (await res.json()) as T;
  }

  const text = await res.text();
  if (!text) return undefined;

  return {
    error: {
      message: text,
    },
  } as T;
}

function readResourceMeta(res: Response): ResourceMeta {
  return {
    version: readOptionalNumber(res.headers.get("X-LifeOS-Version")),
    revision: readOptionalNumber(res.headers.get("X-LifeOS-Revision")),
    updatedAt: res.headers.get("X-LifeOS-Updated-At"),
  };
}

function mergeMeta(
  headerMeta: ResourceMeta,
  bodyMeta?: Partial<ResourceMeta>,
): ResourceMeta {
  return {
    version: headerMeta.version ?? readOptionalNumber(bodyMeta?.version),
    revision: headerMeta.revision ?? readOptionalNumber(bodyMeta?.revision),
    updatedAt: headerMeta.updatedAt ?? normalizeOptionalString(bodyMeta?.updatedAt),
  };
}

function toResourceApiError(status: number, payload: unknown): ResourceApiError {
  const parsed = payload as ApiErrorPayload | undefined;
  const message =
    parsed?.error?.message ||
    (status === 409
      ? "This data changed somewhere else. Reload and try again."
      : "Request failed");

  return new ResourceApiError({
    status,
    message,
    code: parsed?.error?.code,
    details: parsed?.error?.details,
  });
}

function readOptionalNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeOptionalString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}
