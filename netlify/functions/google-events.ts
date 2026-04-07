import type { Handler, HandlerResponse } from "@netlify/functions";

function getBaseUrl() {
  return process.env.URL || "http://localhost:8888";
}

function parseCookies(cookieHeader: string | undefined) {
  const cookies: Record<string, string> = {};

  if (!cookieHeader) return cookies;

  for (const part of cookieHeader.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (!rawName) continue;
    cookies[rawName] = decodeURIComponent(rawValue.join("="));
  }

  return cookies;
}

function createCookie(
  name: string,
  value: string,
  maxAgeSeconds: number,
  httpOnly = true,
) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    `Max-Age=${maxAgeSeconds}`,
    "SameSite=Lax",
  ];

  if (httpOnly) parts.push("HttpOnly");

  const baseUrl = getBaseUrl();
  if (baseUrl.startsWith("https://")) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

async function refreshAccessToken(refreshToken: string) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID || "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data?.error || "Failed to refresh token");
  }

  return data as {
    access_token: string;
    expires_in?: number;
  };
}

export const handler: Handler = async (event): Promise<HandlerResponse> => {
  try {
    const cookies = parseCookies(event.headers.cookie);
    let accessToken = cookies.lifeos_google_access_token;
    const refreshToken = cookies.lifeos_google_refresh_token;

    const timeMin = event.queryStringParameters?.timeMin;
    const timeMax = event.queryStringParameters?.timeMax;

    if (!timeMin || !timeMax) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing timeMin or timeMax" }),
        headers: {
          "Content-Type": "application/json",
        },
      };
    }

    if (!accessToken && refreshToken) {
      const refreshed = await refreshAccessToken(refreshToken);
      accessToken = refreshed.access_token;

      return {
        statusCode: 200,
        body: JSON.stringify({ retry: true }),
        headers: {
          "Content-Type": "application/json",
        },
        multiValueHeaders: {
          "Set-Cookie": [
            createCookie(
              "lifeos_google_access_token",
              accessToken,
              Number(refreshed.expires_in || 3600),
            ),
          ],
        },
      };
    }

    if (!accessToken) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: "Not authenticated with Google" }),
        headers: {
          "Content-Type": "application/json",
        },
      };
    }

    const params = new URLSearchParams({
      timeMin,
      timeMax,
      singleEvents: "true",
      orderBy: "startTime",
    });

    let googleRes = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );

    if (googleRes.status === 401 && refreshToken) {
      const refreshed = await refreshAccessToken(refreshToken);
      accessToken = refreshed.access_token;

      googleRes = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );

      const data = await googleRes.json();

      return {
        statusCode: googleRes.status,
        body: JSON.stringify(data),
        headers: {
          "Content-Type": "application/json",
        },
        multiValueHeaders: {
          "Set-Cookie": [
            createCookie(
              "lifeos_google_access_token",
              accessToken,
              Number(refreshed.expires_in || 3600),
            ),
          ],
        },
      };
    }

    const data = await googleRes.json();

    return {
      statusCode: googleRes.status,
      body: JSON.stringify(data),
      headers: {
        "Content-Type": "application/json",
      },
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      headers: {
        "Content-Type": "application/json",
      },
    };
  }
};