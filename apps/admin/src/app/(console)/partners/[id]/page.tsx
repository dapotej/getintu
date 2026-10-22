"use client";
import { Badge, Button, Card, Checkbox, EmptyState, Field, Icon, Input, minorToMajorInput, PageHeader, parseMajorToMinor, Select, Table, Td, Textarea } from "@intu/ui";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ActionForm, checked, text, textOrNull } from "@/components/forms";
import { api, useApi } from "@/lib/api";
import { useStaff } from "@/lib/auth";
import { markup, OFFER_MODELS, PARTNER_STATUSES, statusToneFor, useCatalogue } from "@/lib/catalogue";
import { CATEGORIES } from "@/lib/labels";
import type { Partner, Venue } from "@/lib/types";

const nairaOrNull = (form: FormData, name: string, label: string) => {
  if (!text(form, name)) return null;
  const minor = parseMajorToMinor(text(form, name));
  if (minor === null) throw new Error(`Enter the ${label} in naira, e.g. 25000`);
  return minor;
};

export default function PartnerPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useStaff();
  const writable = can("partners.write");
  const { data, error, setData } = useApi<{ partner: Partner; venues: Venue[] }>(`/admin/partners/${id}`);
  const { ordered, byId } = useCatalogue();

  if (error) return <p className="text-sm text-danger">{error}</p>;
  if (!data) return <p className="text-sm text-muted">Loading…</p>;
  const { partner: p, venues } = data;
  const save = async (body: Record<string, unknown>) => {
    const res = await api<{ partner: Partner }>(`/admin/partners/${id}`, { method: "PATCH", body });
    setData({ partner: res.partner, venues });
  };
  const category = p.categoryId ? byId.get(p.categoryId) : null;

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/partners" className="inline-flex items-center gap-1 hover:text-fg">
            <Icon name="back" className="size-4" /> Partners and venues
          </Link>
        }
        title={p.tradingName}
        subtitle={[p.legalName !== p.tradingName ? p.legalName : null, category?.name, p.isTest ? "TEST" : null].filter(Boolean).join("  ·  ") || undefined}
        actions={
          <>
            {p.priority ? <Badge tone={p.priority === "P1" ? "accent" : "neutral"}>{p.priority}</Badge> : null}
            <Badge dot tone={statusToneFor(p.status)}>
              {PARTNER_STATUSES[p.status]}
            </Badge>
          </>
        }
      />
      <div className="grid items-start gap-6 xl:grid-cols-[1.3fr_1fr]">
        <Card title="The deal" description="Where it stands and what intu would pay. Markup is worked out from cost and retail.">
          <ActionForm
            success="Saved."
            action={(form) =>
              save({
                status: text(form, "status"),
                priority: textOrNull(form, "priority"),
                categoryId: textOrNull(form, "categoryId"),
                proposedOffer: textOrNull(form, "proposedOffer"),
                offerModel: textOrNull(form, "offerModel"),
                proposedCostMinor: nairaOrNull(form, "cost", "cost"),
                proposedRetailMinor: nairaOrNull(form, "retail", "retail price"),
                pricesArePlaceholders: checked(form, "placeholder"),
                nextAction: textOrNull(form, "nextAction"),
                notes: textOrNull(form, "notes"),
              })
            }
          >
            {(busy) => (
              <fieldset disabled={!writable} className="grid gap-4 sm:grid-cols-2">
                <Field label="Status">
                  <Select name="status" defaultValue={p.status}>
                    {Object.entries(PARTNER_STATUSES).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Priority">
                  <Select name="priority" defaultValue={p.priority ?? ""}>
                    <option value="">None</option>
                    <option value="P1">P1</option>
                    <option value="P2">P2</option>
                    <option value="P3">P3</option>
                  </Select>
                </Field>
                <div className="sm:col-span-2">
                  <Field label="Category">
                    <Select name="categoryId" defaultValue={p.categoryId ?? ""}>
                      <option value="">None</option>
                      {ordered
                        .filter(({ c }) => c.level !== "service")
                        .map(({ c, depth }) => (
                          <option key={c.id} value={c.id}>
                            {" ".repeat(depth)}
                            {c.name}
                          </option>
                        ))}
                    </Select>
                  </Field>
                </div>
                <div className="sm:col-span-2">
                  <Field label="Proposed offer">
                    <Input name="proposedOffer" defaultValue={p.proposedOffer ?? ""} placeholder="Entry + F&B credit" />
                  </Field>
                </div>
                <Field label="How it's offered">
                  <Select name="offerModel" defaultValue={p.offerModel ?? ""}>
                    <option value="">Not decided</option>
                    {Object.entries(OFFER_MODELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </Select>
                </Field>
                <div className="flex items-end pb-2">
                  <Checkbox name="placeholder" defaultChecked={p.pricesArePlaceholders} label="Prices are placeholders" />
                </div>
                <Field label="Cost (₦ per use)" hint="What intu would pay">
                  <Input name="cost" inputMode="decimal" defaultValue={p.proposedCostMinor === null ? "" : minorToMajorInput(p.proposedCostMinor)} />
                </Field>
                <Field label="Retail (₦)" hint={markup(p.proposedCostMinor, p.proposedRetailMinor) ? `${markup(p.proposedCostMinor, p.proposedRetailMinor)} markup` : "What a member would pay"}>
                  <Input name="retail" inputMode="decimal" defaultValue={p.proposedRetailMinor === null ? "" : minorToMajorInput(p.proposedRetailMinor)} />
                </Field>
                <div className="sm:col-span-2">
                  <Field label="Next action">
                    <Input name="nextAction" defaultValue={p.nextAction ?? ""} placeholder="Call the GM about December capacity" />
                  </Field>
                </div>
                <div className="sm:col-span-2">
                  <Field label="Notes">
                    <Textarea name="notes" defaultValue={p.notes ?? ""} />
                  </Field>
                </div>
                {writable ? (
                  <div className="sm:col-span-2">
                    <Button type="submit" disabled={busy}>
                      Save deal
                    </Button>
                  </div>
                ) : null}
              </fieldset>
            )}
          </ActionForm>
        </Card>

        <div className="flex flex-col gap-6">
          <Card title="Business details" description={p.hasBankDetails ? "Bank details on file." : "No bank details yet."}>
            <ActionForm
              success="Saved."
              action={(form) =>
                save({
                  legalName: text(form, "legalName"),
                  tradingName: text(form, "tradingName"),
                  contactName: textOrNull(form, "contactName"),
                  contactEmail: textOrNull(form, "contactEmail"),
                  contactPhone: textOrNull(form, "contactPhone"),
                  settlementTerms: textOrNull(form, "settlementTerms"),
                  active: checked(form, "active"),
                })
              }
            >
              {(busy) => (
                <fieldset disabled={!writable} className="flex flex-col gap-4">
                  <Field label="Legal name">
                    <Input name="legalName" defaultValue={p.legalName} required />
                  </Field>
                  <Field label="Trading name">
                    <Input name="tradingName" defaultValue={p.tradingName} required />
                  </Field>
                  <Field label="Contact name">
                    <Input name="contactName" defaultValue={p.contactName ?? ""} />
                  </Field>
                  <Field label="Contact email">
                    <Input name="contactEmail" type="email" defaultValue={p.contactEmail ?? ""} />
                  </Field>
                  <Field label="Contact phone">
                    <Input name="contactPhone" type="tel" defaultValue={p.contactPhone ?? ""} />
                  </Field>
                  <Field label="Settlement terms">
                    <Input name="settlementTerms" defaultValue={p.settlementTerms ?? ""} />
                  </Field>
                  <Checkbox name="active" defaultChecked={p.active} label="Active" />
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

          <Card title="Venues" flush actions={writable ? <Link href="/partners" className="text-sm font-semibold text-accent hover:underline">Add venue</Link> : null}>
            {venues.length === 0 ? (
              <EmptyState title="No venues yet">Add one once the deal is signed.</EmptyState>
            ) : (
              <Table head={["Venue", "Category", "Tier"]}>
                {venues.map((v) => (
                  <tr key={v.id}>
                    <Td>
                      <Link href={`/venues/${v.id}`} className="font-semibold text-fg hover:text-accent">
                        {v.name}
                      </Link>
                      <p className="text-xs text-muted">{v.area}</p>
                    </Td>
                    <Td className="text-muted">{CATEGORIES[v.category as keyof typeof CATEGORIES] ?? v.category}</Td>
                    <Td>
                      <Badge tone={v.tier === "top" ? "day" : "neutral"}>{v.tier === "top" ? "Top tier" : "Standard"}</Badge>
                    </Td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
