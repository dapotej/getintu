// An in-memory router standing in for Next.js routing in the single-page demo build.
import { createContext, useContext, useMemo, useSyncExternalStore, type AnchorHTMLAttributes, type ReactNode } from "react";

let current = "/login";
const listeners = new Set<() => void>();
export function navigate(to: string) {
  current = to;
  listeners.forEach((l) => l());
  window.scrollTo(0, 0);
}
const subscribe = (l: () => void) => (listeners.add(l), () => listeners.delete(l));
export const useLocation = () => useSyncExternalStore(subscribe, () => current);

export const ParamsContext = createContext<Record<string, string>>({});

// next/navigation
export function useRouter() {
  return useMemo(() => ({ push: navigate, replace: navigate, back: () => navigate("/"), refresh: () => {}, prefetch: () => {} }), []);
}
export const usePathname = () => useLocation().split("?")[0] ?? "/";
export const useParams = <T extends Record<string, string>>() => useContext(ParamsContext) as T;
export function useSearchParams() {
  const loc = useLocation();
  return useMemo(() => new URLSearchParams(loc.split("?")[1] ?? ""), [loc]);
}
export function redirect(to: string): never {
  navigate(to);
  throw new Error("redirect");
}

// next/link
export default function Link({ href, children, onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children?: ReactNode }) {
  return (
    <a
      href={href}
      {...rest}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented || e.metaKey || e.ctrlKey) return;
        e.preventDefault();
        navigate(href);
      }}
    >
      {children}
    </a>
  );
}
