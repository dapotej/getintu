"use client";
import { Badge, Button, Card, Checkbox, EmptyState, Field, Icon, Input, PageHeader, Select, Table, Td } from "@intu/ui";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { ActionForm, checked, text, textOrNull } from "@/components/forms";
import { HoursEditor, readHours } from "@/components/hours";
import { api, useApi } from "@/lib/api";
import { useStaff } from "@/lib/auth";
import { CategorySelect } from "@/components/category-select";
import { useCatalogue } from "@/lib/catalogue";
import type { Partner, Venue } from "@/lib/types";

export default function PartnerPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useStaff();
  const writable = can("partners.write");
  const router = useRouter();
  const { data, error, setData } = useApi<{ partner: Partner; venues: Venue[] }>(`/admin/partners/${id}`);
  const [adding, setAdding] = useState(false);
  const { byId } = useCatalogue();

  if (error) return <p className="text-sm text-danger">{error}</p>;
  if (!data) return <p className="text-sm text-muted">Loading…</p>;
  const { partner: p, venues } = data;

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/partners" className="inline-flex items-center gap-1 hover:text-fg">
            <Icon name="back" className="size-4" /> Partners
          </Link>
        }
        title={p.tradingName}
        subtitle={[p.legalName !== p.tradingName ? p.legalName : null, p.isTest ? "TEST" : null].filter(Boolean).join("  ·  ") || undefined}
        actions={
          <Badge dot tone={p.active ? "night" : "neutral"}>
            {p.active ? "Active" : "Inactive"}
          </Badge>
        }
      />
      <div className="grid items-start gap-6 xl:grid-cols-[1.5fr_1fr]">
        <div className="flex flex-col gap-6">
          <Card
            title="Venues"
            description="Each venue has its own hours, tier and offers. Open one to manage them."
            flush
            actions={
              writable ? (
                <Button size="sm" tone={adding ? "ghost" : "secondary"} onClick={() => setAdding((a) => !a)}>
                  {adding ? "Cancel" : (<><Icon name="plus" className="size-4" /> Add venue</>)}
                </Button>
              ) : null
            }
          >
            {adding ? (
              <div className="border-b border-line p-5">
                <ActionForm
                  className="grid gap-6 lg:grid-cols-2"
                  action={async (form) => {
                    const { venue } = await api<{ venue: Venue }>("/admin/venues", {
                      method: "POST",
                      body: { partnerId: id, name: text(form, "name"), area: text(form, "area"), city: text(form, "city"), categoryId: text(form, "categoryId"), tier: text(form, "tier"), openingHours: readHours(form, "hours") },
                    });
                    router.push(`/partners/${id}/venues/${venue.id}`);
                  }}
                >
                  {(busy) => (
                    <>
                      <div className="grid content-start gap-4 sm:grid-cols-2">
                        <div className="sm:col-span-2">
                          <Field label="Venue name">
                            <Input name="name" required />
                          </Field>
                        </div>
                        <Field label="Area">
                          <Input name="area" placeholder="Oniru" required />
                        </Field>
                        <Field label="City">
                          <Select name="city">
                            <option value="lagos">Lagos</option>
                            <option value="abuja">Abuja</option>
                          </Select>
                        </Field>
                        <Field label="Kind of place" hint="From the catalogue, e.g. Beach Clubs">
                          <CategorySelect name="categoryId" placesOnly required />
                        </Field>
                        <Field label="Tier" hint="Top-tier venues are only open to plans whose benefits include them.">
                          <Select name="tier">
                            <option value="standard">Standard</option>
                            <option value="top">Top tier</option>
                          </Select>
                        </Field>
                      </div>
                      <HoursEditor name="hours" />
                      <div className="lg:col-span-2">
                        <Button type="submit" disabled={busy}>
                          Add venue
                        </Button>
                      </div>
                    </>
                  )}
                </ActionForm>
              </div>
            ) : null}
            {venues.length === 0 ? (
              <EmptyState title="No venues yet">{writable ? "Add the first place members can visit." : null}</EmptyState>
            ) : (
              <Table head={["Venue", "Category", "Tier", "Status"]}>
                {venues.map((v) => (
                  <tr key={v.id}>
                    <Td>
                      <Link href={`/partners/${id}/venues/${v.id}`} className="font-semibold text-fg hover:text-accent">
                        {v.name}
                      </Link>
                      <p className="text-xs text-muted">
                        {v.area}, {v.city === "lagos" ? "Lagos" : "Abuja"}
                      </p>
                    </Td>
                    <Td className="text-muted">{byId.get(v.categoryId)?.name ?? "–"}</Td>
                    <Td>
                      <Badge tone={v.tier === "top" ? "day" : "neutral"}>{v.tier === "top" ? "Top tier" : "Standard"}</Badge>
                    </Td>
                    <Td>
                      <Badge dot tone={v.active ? "night" : "neutral"}>
                        {v.active ? "Active" : "Inactive"}
                      </Badge>
                    </Td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>
        </div>

        <Card title="Business details" description={p.hasBankDetails ? "Bank details on file." : "No bank details yet."}>
          <ActionForm
            success="Saved."
            action={async (form) => {
              const res = await api<{ partner: Partner }>(`/admin/partners/${id}`, {
                method: "PATCH",
                body: {
                  legalName: text(form, "legalName"),
                  tradingName: text(form, "tradingName"),
                  contactName: textOrNull(form, "contactName"),
                  contactEmail: textOrNull(form, "contactEmail"),
                  contactPhone: textOrNull(form, "contactPhone"),
                  settlementTerms: textOrNull(form, "settlementTerms"),
                  active: checked(form, "active"),
                },
              });
              setData({ partner: res.partner, venues });
            }}
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
      </div>
    </>
  );
}
