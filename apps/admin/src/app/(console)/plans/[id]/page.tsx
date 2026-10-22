"use client";
import { Badge, Button, Card, Checkbox, DetailList, EmptyState, Field, formatDate, formatMoney, Icon, Input, minorToMajorInput, PageHeader, parseMajorToMinor, Select, SidePanel, Table, Td } from "@intu/ui";
import { CategorySelect } from "@/components/category-select";
import { PlanCostingCard } from "@/components/plan-costing";
import { isNight, useCatalogue } from "@/lib/catalogue";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ActionForm, checked, intOrNull, text, textOrNull } from "@/components/forms";
import { api, useApi } from "@/lib/api";
import { useStaff } from "@/lib/auth";
import type { Benefit, Plan } from "@/lib/types";

const CURRENCIES = ["GBP", "USD", "NGN"] as const;
const PERIODS = { per_pass: "Per pass", per_month: "Per calendar month", per_year: "Per membership year" };

/** Naira typed as major units → kobo; blank → null. */
const nairaOrNull = (form: FormData, name: string, label: string) => {
  if (!text(form, name)) return null;
  const kobo = parseMajorToMinor(text(form, name));
  if (kobo === null) throw new Error(`Enter the ${label} in naira, e.g. 30000`);
  return kobo;
};

const dates = (from: string | null, to: string | null) => (from || to ? `${from ? formatDate(from) : "…"} to ${to ? formatDate(to) : "…"}` : null);

const EditButton = ({ open }: { open: () => void }) => (
  <Button size="sm" tone="secondary" onClick={open}>
    <Icon name="edit" className="size-4" /> Edit
  </Button>
);

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
      <div className="grid items-start gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Card
          title="Details"
          actions={
            writable ? (
              <SidePanel title="Edit plan details" trigger={(open) => <EditButton open={open} />}>
                {(close) => (
                  <ActionForm
                    action={async (form) => {
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
                            overheadPerMemberMinor: nairaOrNull(form, "overhead", "fixed costs") ?? 0,
                            active: checked(form, "active"),
                          },
                        }),
                      );
                      close();
                    }}
                  >
                    {(busy) => (
                      <>
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
                        <Field label="Fixed costs per member (₦)" hint="Concierge, operations and payment fees. Used for the cost and margin.">
                          <Input name="overhead" inputMode="decimal" className="tabular-nums" defaultValue={plan.overheadPerMemberMinor ? minorToMajorInput(plan.overheadPerMemberMinor) : ""} placeholder="e.g. 30,000" />
                        </Field>
                        <Checkbox name="active" defaultChecked={plan.active} label="Active" hint="Inactive plans can't be given to new members." />
                        <Button type="submit" disabled={busy}>
                          Save details
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
            items={[
              ["Description", plan.description],
              ["Season", dates(plan.seasonStartsOn, plan.seasonEndsOn)],
              ["On sale", dates(plan.onSaleFrom, plan.onSaleTo)],
              ["Duration", plan.durationDays ? `${plan.durationDays} days` : null],
              ["People per pass", plan.groupSize],
              ["Fixed costs per member", plan.overheadPerMemberMinor ? formatMoney(plan.overheadPerMemberMinor, "NGN") : null],
              ["Status", plan.active ? "Active" : "Inactive: can't be given to new members"],
            ]}
          />
        </Card>

        <Card
          title="Prices"
          description="In pounds, dollars or naira."
          actions={
            writable ? (
              <SidePanel title="Edit prices" description="Leave a currency blank if the plan isn't sold in it." trigger={(open) => <EditButton open={open} />}>
                {(close) => (
                  <ActionForm
                    action={async (form) => {
                      const prices = CURRENCIES.flatMap((currency) => {
                        const raw = text(form, currency);
                        if (!raw) return [];
                        const amountMinor = parseMajorToMinor(raw);
                        if (amountMinor === null) throw new Error(`${currency} price "${raw}" isn't an amount`);
                        return [{ currency, amountMinor }];
                      });
                      setData(await api(`/admin/plans/${id}/prices`, { method: "PUT", body: { prices } }));
                      close();
                    }}
                  >
                    {(busy) => (
                      <>
                        {CURRENCIES.map((c) => {
                          const price = plan.prices.find((p) => p.currency === c);
                          return (
                            <Field key={c} label={c}>
                              <Input name={c} inputMode="decimal" placeholder={c === "NGN" ? "e.g. 1,500,000" : "e.g. 299"} className="tabular-nums" defaultValue={price ? minorToMajorInput(price.amountMinor) : ""} />
                            </Field>
                          );
                        })}
                        <Button type="submit" disabled={busy}>
                          Save prices
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
            items={CURRENCIES.map((c) => {
              const price = plan.prices.find((p) => p.currency === c);
              return [c, price ? <span className="tabular-nums">{formatMoney(price.amountMinor, c)}</span> : <span className="text-faint">Not sold</span>];
            })}
          />
        </Card>
      </div>

      <Card
        title="Benefits"
        description="What each member gets, the rules at the door, and which venue tiers it opens."
        className="mt-6"
        flush
        actions={
          writable ? (
            <SidePanel
              title="Add a benefit"
              description="A whole category, a subcategory, or one service type. Set its rules and costing after."
              trigger={(open) => (
                <Button size="sm" tone="secondary" onClick={open}>
                  <Icon name="plus" className="size-4" /> Add benefit
                </Button>
              )}
            >
              {(close) => (
                <ActionForm
                  action={async (form) => {
                    if (!text(form, "categoryId")) throw new Error("Choose what the benefit covers");
                    setData(await api(`/admin/plans/${id}/benefits`, { method: "POST", body: { categoryId: text(form, "categoryId"), quantity: intOrNull(form, "quantity"), period: text(form, "period") } }));
                    close();
                  }}
                >
                  {(busy) => (
                    <>
                      <Field label="Covers">
                        <CategorySelect name="categoryId" exclude={taken} />
                      </Field>
                      <Field label="Quantity">
                        <Input name="quantity" type="number" min={0} placeholder="Unlimited" />
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
                        Add benefit
                      </Button>
                    </>
                  )}
                </ActionForm>
              )}
            </SidePanel>
          ) : null
        }
      >
        {benefits.length === 0 ? (
          <EmptyState title="No benefits yet" />
        ) : (
          <Table head={["Benefit", "Allowance", "Rules", "Venue tiers", ""]}>
            {benefits.map((b) => (
              <BenefitRow key={b.id} benefit={b} writable={writable} onChange={setData} />
            ))}
          </Table>
        )}
      </Card>

      {plan.costing ? <PlanCostingCard plan={plan} costing={plan.costing} /> : null}
    </>
  );
}

function BenefitRow({ benefit: b, writable, onChange }: { benefit: Benefit; writable: boolean; onChange: (d: { plan: Plan }) => void }) {
  const { path } = useCatalogue();
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
        <div className="flex flex-wrap gap-1">{rules.length ? rules.map((r) => <Badge key={r}>{r}</Badge>) : <span className="text-faint">–</span>}</div>
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
      <Td className="text-right">
        {writable ? (
          <SidePanel
            title={`Edit ${b.category.name}`}
            description={path(b.category.code) || undefined}
            trigger={(open) => (
              <Button size="sm" tone="ghost" onClick={open}>
                Edit
              </Button>
            )}
          >
            {(close) => (
              <ActionForm
                className="flex flex-col gap-6"
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
                        costBasis: text(form, "costBasis"),
                        plannedCostMinor: nairaOrNull(form, "plannedCost", "planning cost"),
                        expectedUsePct: intOrNull(form, "expectedUsePct") ?? 60,
                      },
                    }),
                  );
                  close();
                }}
              >
                {(busy) => (
                  <>
                    <div className="grid gap-4 sm:grid-cols-2">
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
                    <fieldset className="flex flex-col gap-4">
                      <legend className="mb-2 text-sm font-medium">Costing</legend>
                      <Field label="Paid">
                        <Select name="costBasis" defaultValue={b.costBasis}>
                          <option value="per_use">Per use</option>
                          <option value="flat_per_member">Flat fee per member</option>
                        </Select>
                      </Field>
                      <Field label="Planning cost (₦)" hint="Per use, or per member when flat. Blank uses the average of the venues' offers.">
                        <Input name="plannedCost" inputMode="decimal" className="tabular-nums" placeholder="Average of offers" defaultValue={b.plannedCostMinor === null ? "" : minorToMajorInput(b.plannedCostMinor)} />
                      </Field>
                      <Field label="Expected use (%)">
                        <Input name="expectedUsePct" type="number" min={0} max={100} defaultValue={b.expectedUsePct} />
                      </Field>
                    </fieldset>
                    <Button type="submit" disabled={busy}>
                      Save benefit
                    </Button>
                  </>
                )}
              </ActionForm>
            )}
          </SidePanel>
        ) : null}
      </Td>
    </tr>
  );
}
