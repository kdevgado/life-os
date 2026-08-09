let _identityPromise: Promise<any> | null = null;

const MOBILE_IDENTITY_STYLE_ID = "lifeos-identity-mobile-styles";

const MOBILE_IDENTITY_STYLES = `
  @media (max-width: 479px) {
    body .modalContainer {
      position: fixed;
      inset: 0;
      width: 100%;
      height: 100%;
      min-height: 0;
      padding: 16px;
      padding-top: max(16px, env(safe-area-inset-top));
      padding-bottom: max(16px, env(safe-area-inset-bottom));
      justify-content: center;
      background: transparent;
    }

    body .modalContainer::before {
      background: rgba(14, 30, 37, 0.7);
      backdrop-filter: blur(6px);
      -webkit-backdrop-filter: blur(6px);
    }

    body .modalDialog {
      flex: 0 1 auto;
      width: min(100%, 364px);
      max-height: calc(100vh - 32px);
      max-height: calc(100dvh - 32px);
      overflow-y: auto;
      overscroll-behavior: contain;
      border-radius: 16px;
      box-shadow: 0 18px 48px rgba(14, 30, 37, 0.28);
    }

    body .modalContent {
      padding: 24px;
      border-radius: 16px;
    }

    body .callOut {
      display: none;
    }
  }
`;

export function applyIdentityWidgetStyles() {
  if (typeof document === "undefined") return;

  const iframe = document.getElementById(
    "netlify-identity-widget",
  ) as HTMLIFrameElement | null;

  if (!iframe) return;

  const applyStyles = () => {
    const iframeDocument = iframe.contentDocument;
    if (!iframeDocument?.head) return;
    if (iframeDocument.getElementById(MOBILE_IDENTITY_STYLE_ID)) return;

    const style = iframeDocument.createElement("style");
    style.id = MOBILE_IDENTITY_STYLE_ID;
    style.textContent = MOBILE_IDENTITY_STYLES;
    iframeDocument.head.appendChild(style);
  };

  iframe.addEventListener("load", applyStyles, { once: true });
  applyStyles();
}

export async function getIdentity() {
  if (typeof window === "undefined") return null;
  if (!_identityPromise) {
    _identityPromise = import("netlify-identity-widget").then((m) => m.default);
  }
  return _identityPromise;
}

export async function getJwt(): Promise<string | null> {
  const id = await getIdentity();
  if (!id) return null;

  const user = id.currentUser?.();
  if (!user) return null;

  // most reliable across widget versions
  if (typeof user.jwt === "function") return await user.jwt();
  if (user.token?.access_token) return user.token.access_token;

  return null;
}

export async function getCurrentUserId(): Promise<string | null> {
  const id = await getIdentity();
  if (!id) return null;

  const user = id.currentUser?.();
  if (!user) return null;

  if (typeof user.id === "string" && user.id) return user.id;
  if (typeof user.sub === "string" && user.sub) return user.sub;

  const jwt = await getJwt();
  const claims = parseJwtClaims(jwt);
  return claims?.sub ?? null;
}

export type AuthEvent = "login" | "logout";
export type AuthListener = () => void;

export async function onAuthChange(listener: AuthListener) {
  const id = await getIdentity();
  if (!id) return () => {};

  const onLogin = () => listener();
  const onLogout = () => listener();

  id.on("login", onLogin);
  id.on("logout", onLogout);

  return () => {
    id.off("login", onLogin);
    id.off("logout", onLogout);
  };
}

function parseJwtClaims(jwt: string | null): { sub?: string } | null {
  if (!jwt) return null;

  try {
    const [, payload] = jwt.split(".");
    if (!payload) return null;

    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(
      Math.ceil(normalized.length / 4) * 4,
      "=",
    );

    return JSON.parse(window.atob(padded)) as { sub?: string };
  } catch {
    return null;
  }
}
