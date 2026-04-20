import type { Handler, HandlerResponse } from "@netlify/functions";

function getBaseUrl() {
  return process.env.URL || "http://localhost:8888";
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

  if (getBaseUrl().startsWith("https://")) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

async function exchangeCodeForTokens(code: string) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Missing Google OAuth environment variables");
  }

  const redirectUri = `${getBaseUrl()}/.netlify/functions/google-callback`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data?.error_description || data?.error || "Token exchange failed");
  }

  return data as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  };
}

export const handler: Handler = async (event): Promise<HandlerResponse> => {
  try {
    const code = event.queryStringParameters?.code;
    const error = event.queryStringParameters?.error;

    if (error) {
      return {
        statusCode: 302,
        body: "",
        headers: {
          Location: `/?google_error=${encodeURIComponent(error)}`,
        },
      };
    }

    if (!code) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing OAuth code" }),
        headers: {
          "Content-Type": "application/json",
        },
      };
    }

    const tokens = await exchangeCodeForTokens(code);

    const cookies = [
      createCookie(
        "lifeos_google_access_token",
        tokens.access_token,
        Number(tokens.expires_in || 3600),
      ),
    ];

    if (tokens.refresh_token) {
      cookies.push(
        createCookie(
          "lifeos_google_refresh_token",
          tokens.refresh_token,
          60 * 60 * 24 * 180,
        ),
      );
    }

    return {
      statusCode: 302,
      body: "",
      headers: {
        Location: "/?connected=google",
      },
      multiValueHeaders: {
        "Set-Cookie": cookies,
      },
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: error instanceof Error ? error.message : "Google callback failed",
      }),
      headers: {
        "Content-Type": "application/json",
      },
    };
  }
};
