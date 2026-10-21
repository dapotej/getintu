"use client";
import { Wordmark } from "@intu/ui";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { StaffGate, useStaff } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/labels";
import { supabase } from "@/lib/supabase";
import type { Permission } from "@/lib/types";

const NAV: { href: string; label: string; needs: Permission }[] = [
  { href: "/members", label: "Members", needs: "members.read" },
  { href: "/plans", label: "Plans and benefits", needs: "plans.read" },
  { href: "/partners", label: "Partners and venues", needs: "partners.read" },
  { href: "/staff", label: "Team", needs: "staff.manage" },
  { href: "/import", label: "Pilot import", needs: "import.pilot" },
];

function Shell({ children }: { children: ReactNode }) {
  const { staff, can } = useStaff();
  const path = usePathname();
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <nav aria-label="Main" className="border-b border-ink-line bg-ink-raised p-4 md:w-60 md:shrink-0 md:border-b-0 md:border-r">
        <Link href="/" className="block">
          <Wordmark className="text-2xl" />
          <span className="ml-1 text-xs text-cream-muted">admin</span>
        </Link>
        <ul className="mt-6 flex gap-1 overflow-x-auto md:flex-col">
          {NAV.filter((n) => can(n.needs)).map((n) => {
            const active = path === n.href || path.startsWith(`${n.href}/`);
            return (
              <li key={n.href}>
                <Link
                  href={n.href}
                  aria-current={active ? "page" : undefined}
                  className={`block whitespace-nowrap rounded-lg px-3 py-2 text-sm ${active ? "bg-night/15 font-semibold text-night" : "text-cream-muted hover:text-cream"}`}
                >
                  {n.label}
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="mt-6 hidden border-t border-ink-line pt-4 text-xs text-cream-muted md:block">
          <p className="font-semibold text-cream">{staff.fullName}</p>
          <p>{ROLE_LABELS[staff.role]}</p>
          <button className="mt-2 underline hover:text-cream" onClick={() => supabase().auth.signOut()}>
            Sign out
          </button>
        </div>
      </nav>
      <main className="min-w-0 flex-1 p-4 md:p-8">{children}</main>
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
