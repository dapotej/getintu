// Stand-in for the Supabase client in the demo: any email and password work, and any 6-digit
// code passes two-step. The real console signs in through Supabase Auth.
type Listener = (event: string) => void;
const listeners = new Set<Listener>();
let level: "none" | "aal1" | "aal2" = "none";
let enrolled = false;
const session = () => (level === "none" ? null : { access_token: "demo", user: { id: "demo-founder", email: "founder@example.com" } });

const auth = {
  getSession: async () => ({ data: { session: session() }, error: null }),
  signInWithPassword: async ({ email }: { email: string; password: string }) => {
    level = "aal1";
    return { data: { session: session(), user: { email } }, error: null };
  },
  signOut: async () => {
    level = "none";
    listeners.forEach((l) => l("SIGNED_OUT"));
    return { error: null };
  },
  updateUser: async () => ({ data: {}, error: null }),
  onAuthStateChange: (cb: Listener) => {
    listeners.add(cb);
    return { data: { subscription: { unsubscribe: () => listeners.delete(cb) } } };
  },
  mfa: {
    getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: level === "aal2" ? "aal2" : "aal1", nextLevel: "aal2" }, error: null }),
    listFactors: async () => {
      const f = enrolled ? [{ id: "demo-factor", status: "verified", factor_type: "totp" }] : [];
      return { data: { all: f, totp: f }, error: null };
    },
    unenroll: async () => ({ data: {}, error: null }),
    enroll: async () => ({
      data: {
        id: "demo-factor",
        totp: { qr_code: `data:image/svg+xml;utf8,${encodeURIComponent(demoQr())}`, secret: "DEMO-KEY-NOT-REAL", uri: "" },
      },
      error: null,
    }),
    challengeAndVerify: async ({ code }: { factorId: string; code: string }) => {
      if (!/^\d{6}$/.test(code)) return { data: null, error: { message: "Invalid code" } };
      enrolled = true;
      level = "aal2";
      return { data: {}, error: null };
    },
  },
};

export function supabase() {
  return { auth };
}

/** A decorative stand-in for a QR code (not scannable). */
function demoQr() {
  let cells = "";
  let seed = 7;
  for (let y = 0; y < 21; y++)
    for (let x = 0; x < 21; x++) {
      const finder = (x < 7 && y < 7) || (x > 13 && y < 7) || (x < 7 && y > 13);
      const ring = finder && (x % 14 === 0 || x % 14 === 6 || y % 14 === 0 || y % 14 === 6 || (x % 14 >= 2 && x % 14 <= 4 && y % 14 >= 2 && y % 14 <= 4));
      seed = (seed * 1103515245 + 12345) % 2147483648;
      if (finder ? ring : seed % 3 === 0) cells += `<rect x="${x}" y="${y}" width="1" height="1"/>`;
    }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-1 -1 23 23" fill="#0d0b1a">${cells}</svg>`;
}
