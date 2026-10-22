"use client";
import { PageHeader } from "@intu/ui";
import { ExchangeRates } from "@/components/exchange-rates";
import { useStaff } from "@/lib/auth";

export default function SettingsPage() {
  const { can } = useStaff();
  return (
    <>
      <PageHeader title="Settings" subtitle="Values the whole console uses." />
      <ExchangeRates writable={can("plans.write")} />
    </>
  );
}
