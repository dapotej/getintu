// Who's signed in, and their member profile, shared by every screen. The profile is cached so
// the app opens straight to the pass with no signal.
import type { Session } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, NoSignal } from "./api";
import { forgetDevice } from "./pass";
import { cache } from "./storage";
import { supabase } from "./supabase";
import type { Me } from "./types";

interface SessionState {
  /** Still reading the saved session from the phone. */
  loading: boolean;
  session: Session | null;
  me: Me | null;
  /** Re-reads the profile from the API (after setting it up, or a new photo). */
  refreshMe: () => Promise<Me | null>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<SessionState | null>(null);
const ME = "intu.me";

export function SessionProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [me, setMe] = useState<Me | null>(null);

  const refreshMe = useCallback(async () => {
    try {
      const fresh = await api<Me>("/me");
      setMe(fresh);
      await cache.set(ME, fresh);
      return fresh;
    } catch (err) {
      if (err instanceof NoSignal) return null;
      throw err;
    }
  }, []);

  useEffect(() => {
    let live = true;
    (async () => {
      const cached = await cache.get<Me>(ME);
      const { data } = await supabase.auth.getSession();
      if (!live) return;
      setSession(data.session);
      if (data.session) {
        if (cached) setMe(cached);
        await refreshMe().catch(() => null);
      }
      if (live) setLoading(false);
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => {
      live = false;
      sub.subscription.unsubscribe();
    };
  }, [refreshMe]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut().catch(() => null);
    await forgetDevice();
    await cache.clear();
    setMe(null);
    setSession(null);
  }, []);

  return <Ctx.Provider value={{ loading, session, me, refreshMe, signOut }}>{children}</Ctx.Provider>;
}

export function useSession() {
  const value = useContext(Ctx);
  if (!value) throw new Error("useSession outside SessionProvider");
  return value;
}
