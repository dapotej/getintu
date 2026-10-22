"use client";
import { Badge, Button, Card, EmptyState, Field, formatDate, formatMoney, Icon, Input, minorToMajorInput, PageHeader, parseMajorToMinor, Table, Td } from "@intu/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ActionForm, intOrNull, text, textOrNull } from "@/components/forms";
import { api, useApi } from "@/lib/api";
import { useStaff } from "@/lib/auth";
import type { FxRate, Plan } from "@/lib/types";

export default function PlansPage() {
  const { can } = useStaff();
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const { data, error } = useApi<{ plans: Plan[] }>("/admin/plans");

  return (
    <>
      <PageHeader
        title="Plans and benefits"
        subtitle="Changing a plan affects new memberships. Allowances already granted keep their numbers."
        actions={
          can("plans.write") ? (
            <Button onClick={() => setAdding((a) => !a)}>
              <Icon name="plus" className="size-4" /> {adding ? "Close" : "New plan"}
            </Button>
          ) : null
        }
      />
      {adding && can("plans.write") ? (
        <Card title="New plan" description="Give a pass season dates, or an annual tier a duration. Prices and benefits come next." className="mb-6">
          <ActionForm
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
            action={async (form) => {
              const { plan } = await api<{ plan: Plan }>("/admin/plans", {
                method: "POST",
                body: {
                  code: text(form, "code").toUpperCase(),
                  name: text(form, "name"),
                  seasonStartsOn: textOrNull(form, "seasonStartsOn"),
                  seasonEndsOn: textOrNull(form, "seasonEndsOn"),
                  durationDays: intOrNull(form, "durationDays"),
                  groupSize: intOrNull(form, "groupSize") ?? 1,
                },
              });
              router.push(`/plans/${plan.id}`);
            }}
          >
            {(busy) => (
              <>
                <Field label="Name">
                  <Input name="name" placeholder="December Pass Plus 2027" required />
                </Field>
                <Field label="Code" hint="Short and unique, e.g. DEC27-PLUS">
                  <Input name="code" required />
                </Field>
                <Field label="People per pass">
                  <Input name="groupSize" type="number" min={1} defaultValue={1} />
                </Field>
                <Field label="Season starts">
                  <Input name="seasonStartsOn" type="date" />
                </Field>
                <Field label="Season ends">
                  <Input name="seasonEndsOn" type="date" />
                </Field>
                <Field label="Duration (days)" hint="For annual tiers">
                  <Input name="durationDays" type="number" min={1} />
                </Field>
                <div className="sm:col-span-2 lg:col-span-3">
                  <Button type="submit" disabled={busy}>
                    Create plan
                  </Button>
                </div>
              </>
            )}
          </ActionForm>
        </Card>
      ) : null}

      <Card flush>
        {error ? <div className="p-5"><p className="text-sm text-danger">{error}</p></div> : null}
        {data?.plans.length === 0 ? (
          <EmptyState title="No plans yet" />
        ) : (
          <Table head={["Plan", "Prices", "Runs", "Status"]}>
            {data?.plans.map((p) => (
              <tr key={p.id}>
                <Td>
                  <Link href={`/plans/${p.id}`} className="font-semibold text-fg hover:text-accent">
                    {p.name}
                  </Link>
                  <p className="text-xs text-muted">
                    {p.code}
                    {p.groupSize > 1 ? ` · ${p.groupSize} people` : ""}
                  </p>
                </Td>
                <Td className="whitespace-nowrap font-medium tabular-nums">{p.prices.map((x) => formatMoney(x.amountMinor, x.currency)).join("  ·  ") || <span className="text-faint">Not priced</span>}</Td>
                <Td className="whitespace-nowrap text-muted">
                  {p.seasonStartsOn && p.seasonEndsOn ? `${formatDate(p.seasonStartsOn)} – ${formatDate(p.seasonEndsOn)}` : p.durationDays ? `${p.durationDays} days from purchase` : "–"}
                </Td>
                <Td>
                  <div className="flex flex-wrap gap-1">
                    <Badge dot tone={p.active ? "night" : "neutral"}>
                      {p.active ? "Active" : "Inactive"}
                    </Badge>
                    {p.isTest ? <Badge>TEST</Badge> : null}
                  </div>
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <ExchangeRates writable={can("plans.write")} />
    </>
  );
}

const FX = [
  { currency: "GBP", label: "Naira per £1" },
  { currency: "USD", label: "Naira per $1" },
] as const;

/** Planning rates: they turn pound and dollar prices into naira for plan margins, and nothing else. */
function ExchangeRates({ writable }: { writable: boolean }) {
  const { data, setData } = useApi<{ rates: FxRate[] }>("/admin/fx-rates");
  if (!data) return null;
  return (
    <Card title="Exchange rates for margins" description="Used only to compare pound and dollar prices with naira costs on each plan. Members are always charged the price set in their currency." className="mt-6">
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
