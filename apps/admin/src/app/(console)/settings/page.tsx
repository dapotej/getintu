"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { SETTINGS_TABS } from "@/components/settings-header";
import { useStaff } from "@/lib/auth";

/** Settings opens on the first tab this person can use. */
export default function SettingsPage() {
  const { can } = useStaff();
  const router = useRouter();
  const first = SETTINGS_TABS.find((t) => can(t.needs));
  useEffect(() => {
    if (first) router.replace(first.href);
  }, [first, router]);
  return null;
}
