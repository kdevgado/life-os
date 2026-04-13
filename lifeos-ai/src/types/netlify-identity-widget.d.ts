declare module "netlify-identity-widget" {
  interface User {
    email?: string;
  }

  const netlifyIdentity: {
    init: (options?: any) => void;
    open: (type?: string) => void;
    close: () => void;
    logout: () => void;
    currentUser: () => User | null;
    on: (event: string, callback: (user?: any) => void) => void;
    off: (event: string, callback?: any) => void;
  };

  export default netlifyIdentity;
}