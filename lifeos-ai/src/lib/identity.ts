let _identityPromise: Promise<any> | null = null;

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