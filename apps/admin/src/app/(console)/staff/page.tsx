"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** The team moved into Settings; old links still work. */
export default function StaffRedirect() {
  const router = useRouter();
  useEffect(() => router.replace("/settings/team"), [router]);
  return null;
}
