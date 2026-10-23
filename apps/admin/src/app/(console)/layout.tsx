"use client";
import { cx, Icon, ThemeSwitch, Wordmark, type IconName } from "@intu/ui";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { StaffGate, useStaff } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/labels";
import { supabase } from "@/lib/supabase";
import type { Permission } from "@/lib/types";

// An item shows when the person has any one of its permissions.
const NAV: { href: string; label: string; icon: IconName; needs: Permission | Permission[] | null }[] = [
  { href: "/", label: "Overview", icon: "home", needs: null },
  { href: "/members", label: "Members", icon: "users", needs: "members.read" },
  { href: "/plans", label: "Plans and benefits", icon: "layers", needs: "plans.read" },
  { href: "/catalogue", label: "Catalogue", icon: "grid", needs: "plans.read" },
  { href: "/partners", label: "Partners", icon: "store", needs: "partners.read" },
  { href: "/clients", label: "Clients", icon: "briefcase", needs: "clients.read" },
  { href: "/payments", label: "Payments", icon: "card", needs: "payments.read" },
  { href: "/bookings", label: "Bookings", icon: "calendar", needs: "members.read" },
  { href: "/visits", label: "Visits to review", icon: "alert", needs: "members.read" },
  { href: "/import", label: "Pilot import", icon: "upload", needs: "import.pilot" },
  { href: "/settings", label: "Settings", icon: "sliders", needs: ["staff.manage", "plans.read"] },
];

const initials = (name: string) =>
  name
    .replace(/^TEST\s+/, "")
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

function Shell({ children }: { children: ReactNode }) {
  const { staff, can } = useStaff();
  const path = usePathname();
  const items = NAV.filter((n) => n.needs === null || [n.needs].flat().some(can));
  const isActive = (href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`));

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[16rem_1fr]">
      <aside className="bg-rail text-rail-fg lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col">
        <div className="flex items-center justify-between gap-3 px-4 py-3 lg:px-5 lg:py-6">
          <Link href="/" className="flex items-baseline gap-2">
            <Wordmark className="text-2xl text-brand-cream" />
            <span className="text-xs font-medium text-rail-muted">admin</span>
          </Link>
          <div className="flex items-center gap-2 lg:hidden">
            <ThemeSwitch />
            <button aria-label="Sign out" className="rounded-md p-1.5 text-rail-muted hover:bg-white/5 hover:text-rail-fg" onClick={() => supabase().auth.signOut()}>
              <Icon name="logout" className="size-[18px]" />
            </button>
          </div>
        </div>
        <nav aria-label="Main" className="overflow-x-auto px-2 pb-2 lg:flex-1 lg:px-3 lg:pb-0">
          <ul className="flex gap-1 lg:flex-col">
            {items.map((n) => {
              const active = isActive(n.href);
              return (
                <li key={n.href}>
                  <Link
                    href={n.href}
                    aria-current={active ? "page" : undefined}
                    className={cx(
                      "flex items-center gap-3 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      active ? "bg-rail-active text-rail-fg" : "text-rail-muted hover:bg-white/5 hover:text-rail-fg",
                    )}
                  >
                    <Icon name={n.icon} className={cx("size-[18px]", active ? "text-brand-night" : "")} />
                    {n.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="hidden border-t border-white/10 p-4 lg:block">
          <div className="flex items-center gap-3">
            <span aria-hidden className="grid size-9 place-items-center rounded-full bg-brand-day/15 text-xs font-bold text-brand-day">
              {initials(staff.fullName)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{staff.fullName}</p>
              <p className="text-xs text-rail-muted">{ROLE_LABELS[staff.role]}</p>
            </div>
            <button title="Sign out" aria-label="Sign out" className="rounded-md p-1.5 text-rail-muted hover:bg-white/5 hover:text-rail-fg" onClick={() => supabase().auth.signOut()}>
              <Icon name="logout" className="size-[18px]" />
            </button>
          </div>
          <ThemeSwitch className="mt-4" />
        </div>
      </aside>
      <main className="min-w-0 px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}

export default function ConsoleLayout({ children }: { children: ReactNode }) {
  return (
    <StaffGate>
      <Shell>{children}</Shell>
    </StaffGate>
  );
}
