"use client";
import { Badge, Button, Card, Checkbox, EmptyState, Field, Icon, Input, minorToMajorInput, PageHeader, parseMajorToMinor, Select, Table, Td } from "@intu/ui";
import { CategorySelect } from "@/components/category-select";
import { isNight, useCatalogue } from "@/lib/catalogue";
import Link from "next/link";
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
  if (error) return <p className="text-sm text-danger">{error}</p>;
  if (!data) return <p className="text-sm text-muted">Loading…</p>;
  const { plan } = data;
  const benefits = plan.benefits ?? [];
  const taken = benefits.map((b) => b.categoryId);

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/plans" className="inline-flex items-center gap-1 hover:text-fg">
            <Icon name="back" className="size-4" /> Plans
          </Link>
        }
        title={plan.name}
        subtitle={`${plan.code}${plan.groupSize > 1 ? ` · ${plan.groupSize} people per pass` : ""}${plan.isTest ? " · TEST" : ""}`}
      />
      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
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
              <fieldset disabled={!writable} className="flex flex-col gap-4">
                <Field label="Name">
                  <Input name="name" defaultValue={plan.name} required />
                </Field>
                <Field label="Description">
                  <Input name="description" defaultValue={plan.description ?? ""} />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
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
                <Checkbox name="active" defaultChecked={plan.active} label="Active" hint="Inactive plans can't be given to new members." />
                {writable ? (
                  <div>
                    <Button type="submit" disabled={busy}>
                      Save details
                    </Button>
                  </div>
                ) : null}
              </fieldset>
            )}
          </ActionForm>
        </Card>

        <Card title="Prices" description="In pounds, dollars or naira. Leave a currency blank if it isn't sold in it.">
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
              <fieldset disabled={!writable} className="flex flex-col gap-4">
                {CURRENCIES.map((c) => {
                  const price = plan.prices.find((p) => p.currency === c);
                  return (
                    <Field key={c} label={c}>
                      <Input name={c} inputMode="decimal" placeholder={c === "NGN" ? "e.g. 1,500,000" : "e.g. 299"} className="tabular-nums" defaultValue={price ? minorToMajorInput(price.amountMinor) : ""} />
                    </Field>
                  );
                })}
                {writable ? (
                  <div>
                    <Button type="submit" disabled={busy}>
                      Save prices
                    </Button>
                  </div>
                ) : null}
              </fieldset>
            )}
          </ActionForm>
        </Card>
      </div>

      <Card title="Benefits" description="What each member gets, the rules at the door, and which venue tiers it opens." className="mt-6" flush>
        {benefits.length === 0 ? (
          <EmptyState title="No benefits yet" />
        ) : (
          <Table head={["Benefit", "Allowance", "Rules", "Venue tiers", ""]}>
            {benefits.map((b) => (
              <BenefitRow key={b.id} benefit={b} writable={writable} onChange={setData} />
            ))}
          </Table>
        )}
        {writable ? (
          <ActionForm
            className="flex flex-wrap items-end gap-3 border-t border-line bg-subtle/60 px-5 py-4"
            action={async (form) => {
              if (!text(form, "categoryId")) throw new Error("Choose what the benefit covers");
              setData(await api(`/admin/plans/${id}/benefits`, { method: "POST", body: { categoryId: text(form, "categoryId"), quantity: intOrNull(form, "quantity"), period: text(form, "period") } }));
            }}
          >
            {(busy) => (
              <>
                <div className="min-w-64 flex-1">
                  <Field label="Add benefit" hint="A whole category, a subcategory, or one service type">
                    <CategorySelect name="categoryId" exclude={taken} />
                  </Field>
                </div>
                <Field label="Quantity">
                  <Input name="quantity" type="number" min={0} placeholder="Unlimited" className="w-32" />
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
  const { path } = useCatalogue();
  if (!editing) {
    const rules = [
      b.capOncePerVenuePerDay && "once per venue per day",
      b.capOncePerVenuePerMonth && "once per venue per month",
      b.sharedByGroup && "shared by the group",
      b.drawPerPerson && "one per person",
    ].filter(Boolean) as string[];
    return (
      <tr>
        <Td>
          <span className="flex items-center gap-2 font-semibold">
            <span aria-hidden className={`size-2 shrink-0 rounded-full ${isNight(b.category.code) ? "bg-brand-night" : "bg-brand-day"}`} />
            {b.category.name}
            {b.category.level !== "service" ? <span className="font-normal text-muted">(all)</span> : null}
          </span>
          <span className="mt-0.5 block text-xs text-muted">{path(b.category.code)}</span>
        </Td>
        <Td className="whitespace-nowrap">
          <span className="font-medium tabular-nums">{b.quantity ?? "Unlimited"}</span> <span className="text-muted">{PERIODS[b.period].toLowerCase()}</span>
        </Td>
        <Td>
          <div className="flex flex-wrap gap-1">
            {rules.length ? rules.map((r) => <Badge key={r}>{r}</Badge>) : <span className="text-faint">–</span>}
          </div>
        </Td>
        <Td>
          <div className="flex gap-1">
            {b.allowedVenueTiers.map((t) => (
              <Badge key={t} tone={t === "top" ? "day" : "neutral"}>
                {t}
              </Badge>
            ))}
          </div>
        </Td>
        <Td className="text-right">{writable ? <Button size="sm" tone="ghost" onClick={() => setEditing(true)}>Edit</Button> : null}</Td>
      </tr>
    );
  }
  return (
    <tr>
      <Td colSpan={5} className="bg-subtle/60">
        <ActionForm
          className="grid gap-5 py-2 md:grid-cols-3"
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
              <p className="font-semibold md:col-span-3">{path(b.category.code) || b.category.name}</p>
              <div className="flex flex-col gap-4">
                <Field label="Quantity">
                  <Input name="quantity" type="number" min={0} placeholder="Unlimited" defaultValue={b.quantity ?? ""} />
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
              </div>
              <fieldset className="flex flex-col gap-3">
                <legend className="mb-2 text-sm font-medium">Rules at the door</legend>
                <Checkbox name="perDay" defaultChecked={b.capOncePerVenuePerDay} label="Once per venue per day" />
                <Checkbox name="perMonth" defaultChecked={b.capOncePerVenuePerMonth} label="Once per venue per month" />
                <Checkbox name="shared" defaultChecked={b.sharedByGroup} label="Shared by the whole group (Crew)" />
                <Checkbox name="perPerson" defaultChecked={b.drawPerPerson} label="Uses one per person in the party" />
              </fieldset>
              <fieldset className="flex flex-col gap-3">
                <legend className="mb-2 text-sm font-medium">Venue tiers</legend>
                <Checkbox name="tier_standard" defaultChecked={b.allowedVenueTiers.includes("standard")} label="Standard" />
                <Checkbox name="tier_top" defaultChecked={b.allowedVenueTiers.includes("top")} label="Top tier" hint="Only venues marked top tier" />
              </fieldset>
              <div className="flex gap-2 md:col-span-3">
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
