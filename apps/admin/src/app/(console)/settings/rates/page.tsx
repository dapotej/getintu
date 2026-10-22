"use client";
import { ExchangeRates } from "@/components/exchange-rates";
import { SettingsHeader } from "@/components/settings-header";
import { useStaff } from "@/lib/auth";

export default function RatesPage() {
  const { can } = useStaff();
  return (
    <>
      <SettingsHeader />
      <ExchangeRates writable={can("plans.write")} />
    </>
  );
}
