import { useEffect, useState } from "react";

type User = { email?: string } | null;

export default function AuthButton() {
  const [user, setUser] = useState<User>(null);
  const [identity, setIdentity] = useState<any>(null);

  useEffect(() => {
    let mounted = true;

    (async () => {
      // Only runs in the browser
      const mod = await import("netlify-identity-widget");
      const netlifyIdentity = mod.default;

      const APIUrl =
        import.meta.env.PUBLIC_NETLIFY_IDENTITY_URL ||
        `${window.location.origin}/.netlify/identity`;

        netlifyIdentity.init({ APIUrl });

      const current = netlifyIdentity.currentUser();
      if (mounted) {
        setIdentity(netlifyIdentity);
        setUser(current ? { email: (current as any).email } : null);
      }

      netlifyIdentity.on("login", (u: any) => {
        setUser(u ? { email: u.email } : null);
        netlifyIdentity.close();
      });

      netlifyIdentity.on("logout", () => setUser(null));
    })();

    return () => {
      mounted = false;
    };
  }, []);

  // While loading identity, show nothing or a placeholder
  if (!identity) {
    return (
      <button className="duna-auth" type="button" disabled>
        Sign in
      </button>
    );
  }

  if (!user) {
    return (
      <button className="duna-auth" type="button" onClick={() => identity.open("login")}>
        Sign in
      </button>
    );
  }

  return (
    <button className="duna-auth" type="button" onClick={() => identity.logout()}>
      Sign out
    </button>
  );
}