"use client";
import { cx, PageHeader } from "@intu/ui";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useStaff } from "@/lib/auth";
import type { Permission } from "@/lib/types";

export const SETTINGS_TABS: { href: string; label: string; needs: Permission }[] = [
  { href: "/settings/team", label: "Team", needs: "staff.manage" },
  { href: "/settings/rates", label: "Exchange rates", needs: "plans.read" },
];

/** The Settings title and its tabs, showing only the tabs this person can use. */
export function SettingsHeader() {
  const { can } = useStaff();
  const path = usePathname();
  return (
    <>
      <PageHeader title="Settings" />
      <nav aria-label="Settings" className="mb-6 flex gap-1 border-b border-line">
        {SETTINGS_TABS.filter((t) => can(t.needs)).map((t) => (
          <Link
            key={t.href}
            href={t.href}
            aria-current={path === t.href ? "page" : undefined}
            className={cx("-mb-px border-b-2 px-3 py-2 text-sm font-semibold", path === t.href ? "border-primary text-fg" : "border-transparent text-muted hover:text-fg")}
          >
            {t.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
