"use client";
import { Badge, BENEFIT_LABELS, Button, Card, Field, Input, minorToMajorInput, PageHeader, parseMajorToMinor, Select, Table, Td } from "@intu/ui";
import { useParams } from "next/navigation";
import { useState } from "react";
import { ActionForm, checked, intOrNull, text, textOrNull } from "@/components/forms";
import { api, useApi } from "@/lib/api";
import { useStaff } from "@/lib/auth";
import type { Benefit, Plan } from "@/lib/types";

const CURRENCIES = ["GBP", "USD", "NGN"] as const;
const PERIODS = { per_pass: "Per pass", per_month: "Per calendar month", per_year: "Per membership year" };

export default function PlanPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useStaff();
  const writable = can("plans.write");
  const { data, error, setData } = useApi<{ plan: Plan }>(`/admin/plans/${id}`);
  if (error) return <p className="text-sm text-pop">{error}</p>;
  if (!data) return <p className="text-sm text-cream-muted">Loading…</p>;
  const { plan } = data;
  const benefits = plan.benefits ?? [];
  const missing = Object.keys(BENEFIT_LABELS).filter((t) => !benefits.some((b) => b.type === t));

  return (
    <>
      <PageHeader title={plan.name} subtitle={`${plan.code}${plan.isTest ? " · TEST" : ""}`} />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Details">
          <ActionForm
            success="Saved."
            action={async (form) =>
              setData(
                await api(`/admin/plans/${id}`, {
                  method: "PATCH",
                  body: {
                    name: text(form, "name"),
                    description: textOrNull(form, "description"),
                    seasonStartsOn: textOrNull(form, "seasonStartsOn"),
                    seasonEndsOn: textOrNull(form, "seasonEndsOn"),
                    durationDays: intOrNull(form, "durationDays"),
                    onSaleFrom: textOrNull(form, "onSaleFrom"),
                    onSaleTo: textOrNull(form, "onSaleTo"),
                    groupSize: intOrNull(form, "groupSize") ?? 1,
                    active: checked(form, "active"),
                  },
                }),
              )
            }
          >
            {(busy) => (
              <fieldset disabled={!writable} className="space-y-4">
                <Field label="Name">
                  <Input name="name" defaultValue={plan.name} required />
                </Field>
                <Field label="Description">
                  <Input name="description" defaultValue={plan.description ?? ""} />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Season starts">
                    <Input name="seasonStartsOn" type="date" defaultValue={plan.seasonStartsOn ?? ""} />
                  </Field>
                  <Field label="Season ends">
                    <Input name="seasonEndsOn" type="date" defaultValue={plan.seasonEndsOn ?? ""} />
                  </Field>
                  <Field label="On sale from">
                    <Input name="onSaleFrom" type="date" defaultValue={plan.onSaleFrom ?? ""} />
                  </Field>
                  <Field label="On sale to">
                    <Input name="onSaleTo" type="date" defaultValue={plan.onSaleTo ?? ""} />
                  </Field>
                  <Field label="Duration (days)">
                    <Input name="durationDays" type="number" min={1} defaultValue={plan.durationDays ?? ""} />
                  </Field>
                  <Field label="People per pass">
                    <Input name="groupSize" type="number" min={1} defaultValue={plan.groupSize} />
                  </Field>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="active" defaultChecked={plan.active} /> Active
                </label>
                {writable ? (
                  <Button type="submit" disabled={busy}>
                    Save details
                  </Button>
                ) : null}
              </fieldset>
            )}
          </ActionForm>
        </Card>

        <Card title="Prices">
          <ActionForm
            success="Prices saved."
            action={async (form) => {
              const prices = CURRENCIES.flatMap((currency) => {
                const raw = text(form, currency);
                if (!raw) return [];
                const amountMinor = parseMajorToMinor(raw);
                if (amountMinor === null) throw new Error(`${currency} price "${raw}" isn't an amount`);
                return [{ currency, amountMinor }];
              });
              setData(await api(`/admin/plans/${id}/prices`, { method: "PUT", body: { prices } }));
            }}
          >
            {(busy) => (
              <fieldset disabled={!writable} className="space-y-4">
                {CURRENCIES.map((c) => {
                  const price = plan.prices.find((p) => p.currency === c);
                  return (
                    <Field key={c} label={c} hint="Leave blank if not sold in this currency.">
                      <Input name={c} inputMode="decimal" defaultValue={price ? minorToMajorInput(price.amountMinor) : ""} />
                    </Field>
                  );
                })}
                {writable ? (
                  <Button type="submit" disabled={busy}>
                    Save prices
                  </Button>
                ) : null}
              </fieldset>
            )}
          </ActionForm>
        </Card>
      </div>

      <Card title="Benefits" className="mt-6">
        <Table head={["Benefit", "Quantity", "Period", "Rules", "Venue tiers", ""]} empty={benefits.length === 0 && "No benefits yet."}>
          {benefits.map((b) => (
            <BenefitRow key={b.id} benefit={b} writable={writable} onChange={setData} />
          ))}
        </Table>
        {writable && missing.length ? (
          <ActionForm className="mt-6 flex flex-wrap items-end gap-3 border-t border-ink-line pt-4" action={async (form) => setData(await api(`/admin/plans/${id}/benefits`, { method: "POST", body: { type: text(form, "type"), quantity: intOrNull(form, "quantity"), period: text(form, "period") } }))}>
            {(busy) => (
              <>
                <Field label="Add benefit">
                  <Select name="type">
                    {missing.map((t) => (
                      <option key={t} value={t}>
                        {BENEFIT_LABELS[t]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Quantity" hint="Blank = unlimited">
                  <Input name="quantity" type="number" min={0} className="w-28" />
                </Field>
                <Field label="Period">
                  <Select name="period">
                    {Object.entries(PERIODS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Button type="submit" disabled={busy}>
                  Add
                </Button>
              </>
            )}
          </ActionForm>
        ) : null}
      </Card>
    </>
  );
}

function BenefitRow({ benefit: b, writable, onChange }: { benefit: Benefit; writable: boolean; onChange: (d: { plan: Plan }) => void }) {
  const [editing, setEditing] = useState(false);
  if (!editing) {
    const rules = [
      b.capOncePerVenuePerDay && "once per venue per day",
      b.capOncePerVenuePerMonth && "once per venue per month",
      b.sharedByGroup && "shared by the group",
      b.drawPerPerson && "one per person",
    ].filter(Boolean);
    return (
      <tr>
        <Td className="font-semibold">{BENEFIT_LABELS[b.type] ?? b.type}</Td>
        <Td>{b.quantity ?? "Unlimited"}</Td>
        <Td className="text-cream-muted">{PERIODS[b.period]}</Td>
        <Td className="text-cream-muted">{rules.join(", ") || "–"}</Td>
        <Td>
          {b.allowedVenueTiers.map((t) => (
            <Badge key={t} tone={t === "top" ? "day" : "muted"}>
              {t}
            </Badge>
          ))}
        </Td>
        <Td>{writable ? <Button tone="ghost" onClick={() => setEditing(true)}>Edit</Button> : null}</Td>
      </tr>
    );
  }
  return (
    <tr>
      <Td colSpan={6}>
        <ActionForm
          className="grid gap-3 rounded-lg border border-ink-line p-4 md:grid-cols-3"
          action={async (form) => {
            const tiers = (["standard", "top"] as const).filter((t) => checked(form, `tier_${t}`));
            if (!tiers.length) throw new Error("Pick at least one venue tier");
            onChange(
              await api(`/admin/benefits/${b.id}`, {
                method: "PATCH",
                body: {
                  quantity: intOrNull(form, "quantity"),
                  period: text(form, "period"),
                  capOncePerVenuePerDay: checked(form, "perDay"),
                  capOncePerVenuePerMonth: checked(form, "perMonth"),
                  sharedByGroup: checked(form, "shared"),
                  drawPerPerson: checked(form, "perPerson"),
                  allowedVenueTiers: tiers,
                },
              }),
            );
            setEditing(false);
          }}
        >
          {(busy) => (
            <>
              <p className="font-semibold md:col-span-3">{BENEFIT_LABELS[b.type] ?? b.type}</p>
              <Field label="Quantity" hint="Blank = unlimited">
                <Input name="quantity" type="number" min={0} defaultValue={b.quantity ?? ""} />
              </Field>
              <Field label="Period">
                <Select name="period" defaultValue={b.period}>
                  {Object.entries(PERIODS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </Select>
              </Field>
              <fieldset className="space-y-1 text-sm">
                <legend className="text-xs font-semibold uppercase tracking-wide text-cream-muted">Venue tiers</legend>
                <label className="flex items-center gap-2">
                  <input type="checkbox" name="tier_standard" defaultChecked={b.allowedVenueTiers.includes("standard")} /> Standard
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" name="tier_top" defaultChecked={b.allowedVenueTiers.includes("top")} /> Top tier
                </label>
              </fieldset>
              <fieldset className="space-y-1 text-sm md:col-span-2">
                <legend className="text-xs font-semibold uppercase tracking-wide text-cream-muted">Rules</legend>
                <label className="flex items-center gap-2">
                  <input type="checkbox" name="perDay" defaultChecked={b.capOncePerVenuePerDay} /> Once per venue per day
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" name="perMonth" defaultChecked={b.capOncePerVenuePerMonth} /> Once per venue per month
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" name="shared" defaultChecked={b.sharedByGroup} /> Shared by the whole group (Crew)
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" name="perPerson" defaultChecked={b.drawPerPerson} /> Uses one per person in the party
                </label>
              </fieldset>
              <div className="flex items-end gap-2">
                <Button type="submit" disabled={busy}>
                  Save
                </Button>
                <Button type="button" tone="ghost" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              </div>
            </>
          )}
        </ActionForm>
      </Td>
    </tr>
  );
}
