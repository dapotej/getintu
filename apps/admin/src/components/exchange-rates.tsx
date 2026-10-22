"use client";
import { Button, Card, DetailList, Field, formatDate, formatMoney, Icon, Input, minorToMajorInput, parseMajorToMinor, SidePanel } from "@intu/ui";
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
  const rateOf = (currency: string) => data.rates.find((r) => r.currency === currency);
  return (
    <Card
      title="Exchange rates for margins"
      description="Used only to compare pound and dollar prices with naira costs on each plan. Members are always charged the price set in their currency."
      actions={
        writable ? (
          <SidePanel
            title="Edit exchange rates"
            description="Used only for plan margins."
            trigger={(open) => (
              <Button size="sm" tone="secondary" onClick={open}>
                <Icon name="edit" className="size-4" /> Edit
              </Button>
            )}
          >
            {(close) => (
              <ActionForm
                action={async (form) => {
                  const rates = FX.flatMap(({ currency, label }) => {
                    const raw = text(form, currency);
                    if (!raw) return [];
                    const koboPerUnit = parseMajorToMinor(raw);
                    if (!koboPerUnit) throw new Error(`${label}: enter an amount, e.g. 1,770`);
                    return [{ currency, koboPerUnit }];
                  });
                  setData(await api<{ rates: FxRate[] }>("/admin/fx-rates", { method: "PUT", body: { rates } }));
                  close();
                }}
              >
                {(busy) => (
                  <>
                    {FX.map(({ currency, label }) => {
                      const rate = rateOf(currency);
                      return (
                        <Field key={currency} label={label}>
                          <Input name={currency} inputMode="decimal" className="tabular-nums" placeholder="e.g. 1,770" defaultValue={rate ? minorToMajorInput(rate.koboPerUnit) : ""} />
                        </Field>
                      );
                    })}
                    <Button type="submit" disabled={busy}>
                      Save rates
                    </Button>
                  </>
                )}
              </ActionForm>
            )}
          </SidePanel>
        ) : null
      }
    >
      <DetailList
        items={FX.map(({ currency, label }) => {
          const rate = rateOf(currency);
          return [
            label,
            rate ? (
              <span>
                <span className="font-medium tabular-nums">{formatMoney(rate.koboPerUnit, "NGN")}</span> <span className="text-muted">· updated {formatDate(rate.updatedAt.slice(0, 10))}</span>
              </span>
            ) : (
              <span className="text-faint">Not set</span>
            ),
          ];
        })}
      />
    </Card>
  );
}
