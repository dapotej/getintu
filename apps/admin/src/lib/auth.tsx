"use client";
import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, ApiError, errorMessage } from "./api";
import { supabase } from "./supabase";
import type { Me, Permission } from "./types";

type State = { status: "loading" } | { status: "ready"; me: Me } | { status: "not_staff" } | { status: "error"; message: string };

const StaffContext = createContext<Me | null>(null);

/** The signed-in staff member. Only usable inside <StaffGate>. */
export function useStaff() {
  const me = useContext(StaffContext);
  if (!me) throw new Error("useStaff must be used inside <StaffGate>");
  return { ...me, can: (p: Permission) => me.permissions.includes(p) };
}

/**
 * Lets children render only for a signed-in intu staff member who has passed two-step
 * verification in this session. Sends everyone else to sign in or verify.
 */
export function StaffGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    const auth = supabase().auth;
    let live = true;
    (async () => {
      const { data } = await auth.getSession();
      if (!data.session) return router.replace("/login");
      const { data: aal } = await auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal?.currentLevel !== "aal2") return router.replace("/two-step");
      try {
        const me = await api<Me>("/admin/me");
        if (live) setState({ status: "ready", me });
      } catch (err) {
        if (!live) return;
        if (err instanceof ApiError && err.code === "two_step_required") return router.replace("/two-step");
        if (err instanceof ApiError && (err.code === "invalid_token" || err.code === "unauthenticated")) return router.replace("/login");
        setState(err instanceof ApiError && err.code === "not_staff" ? { status: "not_staff" } : { status: "error", message: errorMessage(err) });
      }
    })();
    const { data: sub } = auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") router.replace("/login");
    });
    return () => {
      live = false;
      sub.subscription.unsubscribe();
    };
  }, [router]);

  if (state.status === "loading") {
    return (
      <div className="grid min-h-screen place-items-center" aria-busy="true">
        <span className="size-6 animate-spin rounded-full border-2 border-line border-t-accent" aria-label="Loading" />
      </div>
    );
  }
  if (state.status === "not_staff" || state.status === "error") {
    return (
      <div className="grid min-h-screen place-items-center px-4">
        <div className="max-w-sm rounded-xl border border-line bg-surface p-6 text-center shadow-card">
          <p className="font-semibold text-fg">{state.status === "not_staff" ? "No access yet" : "Something went wrong"}</p>
          <p className="mt-1 text-sm text-muted">{state.status === "not_staff" ? "This account isn't on the intu team. Ask an ops lead to invite you." : state.message}</p>
          <button className="mt-4 text-sm font-semibold text-accent hover:underline" onClick={() => supabase().auth.signOut()}>
            Sign out
          </button>
        </div>
      </div>
    );
  }
  return <StaffContext.Provider value={state.me}>{children}</StaffContext.Provider>;
}
