"use client";
import { Button, Card, Field, formatDate, Input, minorToMajorInput, parseMajorToMinor } from "@intu/ui";
import { ActionForm, text } from "@/components/forms";
import { api, useApi } from "@/lib/api";
import type { FxRate } from "@/lib/types";

const FX = [
  { currency: "GBP", label: "Naira per £1" },
  { currency: "USD", label: "Naira per $1" },
] as const;

/** Planning rates: they turn pound and dollar prices into naira for plan margins, and nothing else. */
export function ExchangeRates({ writable }: { writable: boolean }) {
  const { data, setData } = useApi<{ rates: FxRate[] }>("/admin/fx-rates");
  if (!data) return null;
  return (
    <Card title="Exchange rates for margins" description="Used only to compare pound and dollar prices with naira costs on each plan. Members are always charged the price set in their currency.">
      <ActionForm
        className="flex flex-wrap items-end gap-4"
        success="Rates saved."
        action={async (form) => {
          const rates = FX.flatMap(({ currency, label }) => {
            const raw = text(form, currency);
            if (!raw) return [];
            const koboPerUnit = parseMajorToMinor(raw);
            if (!koboPerUnit) throw new Error(`${label}: enter an amount, e.g. 1,770`);
            return [{ currency, koboPerUnit }];
          });
          setData(await api<{ rates: FxRate[] }>("/admin/fx-rates", { method: "PUT", body: { rates } }));
        }}
      >
        {(busy) => (
          <fieldset disabled={!writable} className="contents">
            {FX.map(({ currency, label }) => {
              const rate = data.rates.find((r) => r.currency === currency);
              return (
                <Field key={currency} label={label} hint={rate ? `Updated ${formatDate(rate.updatedAt.slice(0, 10))}` : "Not set"}>
                  <Input name={currency} inputMode="decimal" className="w-40 tabular-nums" placeholder="e.g. 1,770" defaultValue={rate ? minorToMajorInput(rate.koboPerUnit) : ""} />
                </Field>
              );
            })}
            {writable ? (
              <Button type="submit" disabled={busy} className="mb-6">
                Save rates
              </Button>
            ) : null}
          </fieldset>
        )}
      </ActionForm>
    </Card>
  );
}
