import type { Handler, HandlerResponse } from "@netlify/functions";

function getBaseUrl(): string {
  return process.env.URL || "http://localhost:8888";
}

function getGoogleClientId(): string {
  const clientId = process.env.GOOGLE_CLIENT_ID;

  if (!clientId) {
    throw new Error("Missing GOOGLE_CLIENT_ID environment variable");
  }

  return clientId;
}

export const handler: Handler = async (): Promise<HandlerResponse> => {
  try {
    const baseUrl = getBaseUrl();

    const params = new URLSearchParams({
      client_id: getGoogleClientId(),
      redirect_uri: `${baseUrl}/.netlify/functions/google-callback`,
      response_type: "code",
      scope: "https://www.googleapis.com/auth/calendar.readonly",
      access_type: "offline",
      prompt: "consent",
    });

    return {
      statusCode: 302,
      body: "",
      headers: {
        Location: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
      },
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error:
          error instanceof Error
            ? error.message
            : "Google auth configuration error",
      }),
      headers: {
        "Content-Type": "application/json",
      },
    };
  }
};