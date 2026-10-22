"use client";
import { Badge, Button, Card, EmptyState, Field, Icon, Input, PageHeader, Select, Table, Td } from "@intu/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ActionForm, text, textOrNull } from "@/components/forms";
import { HoursEditor, readHours } from "@/components/hours";
import { api, useApi } from "@/lib/api";
import { useStaff } from "@/lib/auth";
import { CATEGORIES } from "@/lib/labels";
import type { Partner, Venue } from "@/lib/types";

export default function PartnersPage() {
  const { can } = useStaff();
  const writable = can("partners.write");
  const router = useRouter();
  const partners = useApi<{ partners: Partner[] }>("/admin/partners");
  const venues = useApi<{ venues: Venue[] }>("/admin/venues");
  const [adding, setAdding] = useState<"partner" | "venue" | null>(null);
  const byPartner = (id: string) => venues.data?.venues.filter((v) => v.partnerId === id) ?? [];

  return (
    <>
      <PageHeader
        title="Partners and venues"
        subtitle="A partner is the business intu pays. Each of its venues has a tier, opening hours and offers."
        actions={
          writable ? (
            <>
              <Button tone="secondary" onClick={() => setAdding(adding === "partner" ? null : "partner")}>
                Add partner
              </Button>
              <Button onClick={() => setAdding(adding === "venue" ? null : "venue")}>
                <Icon name="plus" className="size-4" /> Add venue
              </Button>
            </>
          ) : null
        }
      />
      {adding === "partner" ? (
        <Card title="New partner" description="The business intu pays for visits." className="mb-6">
          <ActionForm
            className="grid gap-4 sm:grid-cols-2"
            action={async (form) => {
              await api("/admin/partners", {
                method: "POST",
                body: { legalName: text(form, "legalName"), tradingName: text(form, "tradingName"), contactName: textOrNull(form, "contactName"), contactEmail: textOrNull(form, "contactEmail"), contactPhone: textOrNull(form, "contactPhone"), settlementTerms: textOrNull(form, "settlementTerms") },
              });
              partners.reload();
              setAdding(null);
            }}
          >
            {(busy) => (
              <>
                <Field label="Legal name">
                  <Input name="legalName" required />
                </Field>
                <Field label="Trading name">
                  <Input name="tradingName" required />
                </Field>
                <Field label="Contact name">
                  <Input name="contactName" />
                </Field>
                <Field label="Contact phone">
                  <Input name="contactPhone" type="tel" />
                </Field>
                <Field label="Contact email">
                  <Input name="contactEmail" type="email" />
                </Field>
                <Field label="Settlement terms">
                  <Input name="settlementTerms" placeholder="Monthly in arrears, bank transfer in naira" />
                </Field>
                <div className="sm:col-span-2">
                  <Button type="submit" disabled={busy}>
                    Add partner
                  </Button>
                </div>
              </>
            )}
          </ActionForm>
        </Card>
      ) : null}
      {adding === "venue" ? (
        <Card title="New venue" description="Offers and rates are added on the venue's page next." className="mb-6">
          <ActionForm
            className="grid gap-6 lg:grid-cols-2"
            action={async (form) => {
              const { venue } = await api<{ venue: Venue }>("/admin/venues", {
                method: "POST",
                body: { partnerId: text(form, "partnerId"), name: text(form, "name"), area: text(form, "area"), city: text(form, "city"), category: text(form, "category"), tier: text(form, "tier"), openingHours: readHours(form, "hours") },
              });
              router.push(`/venues/${venue.id}`);
            }}
          >
            {(busy) => (
              <>
                <div className="grid content-start gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <Field label="Partner">
                      <Select name="partnerId" required>
                        {partners.data?.partners.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.tradingName}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                  <Field label="Venue name">
                    <Input name="name" required />
                  </Field>
                  <Field label="Area">
                    <Input name="area" placeholder="Oniru" required />
                  </Field>
                  <Field label="City">
                    <Select name="city">
                      <option value="lagos">Lagos</option>
                      <option value="abuja">Abuja</option>
                    </Select>
                  </Field>
                  <Field label="Category">
                    <Select name="category">
                      {Object.entries(CATEGORIES).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <div className="sm:col-span-2">
                    <Field label="Tier" hint="Top-tier venues are only open to plans whose benefits include them.">
                      <Select name="tier">
                        <option value="standard">Standard</option>
                        <option value="top">Top tier</option>
                      </Select>
                    </Field>
                  </div>
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
        </Card>
      ) : null}

      {partners.error ? <p className="text-sm text-danger">{partners.error}</p> : null}
      <div className="flex flex-col gap-5">
        {partners.data?.partners.map((p) => (
          <Card
            key={p.id}
            title={p.tradingName}
            description={[p.legalName !== p.tradingName ? p.legalName : null, p.contactName, p.contactEmail].filter(Boolean).join("  ·  ") || undefined}
            flush
            actions={
              <>
                {p.isTest ? <Badge>TEST</Badge> : null}
                {!p.active ? (
                  <Badge dot tone="danger">
                    Inactive
                  </Badge>
                ) : null}
                <Badge dot tone={p.hasBankDetails ? "night" : "neutral"}>
                  {p.hasBankDetails ? "Bank details on file" : "No bank details"}
                </Badge>
              </>
            }
          >
            {byPartner(p.id).length === 0 ? (
              <EmptyState title="No venues yet" />
            ) : (
              <Table head={["Venue", "Area", "Category", "Tier", "Status"]}>
                {byPartner(p.id).map((v) => (
                  <tr key={v.id}>
                    <Td>
                      <Link href={`/venues/${v.id}`} className="font-semibold text-fg hover:text-accent">
                        {v.name}
                      </Link>
                    </Td>
                    <Td className="text-muted">{v.area}</Td>
                    <Td className="text-muted">{CATEGORIES[v.category as keyof typeof CATEGORIES] ?? v.category}</Td>
                    <Td>
                      <Badge tone={v.tier === "top" ? "day" : "neutral"}>{v.tier === "top" ? "Top tier" : "Standard"}</Badge>
                    </Td>
                    <Td>
                      <Badge dot tone={v.active ? "night" : "danger"}>
                        {v.active ? "Active" : "Inactive"}
                      </Badge>
                    </Td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>
        ))}
      </div>
    </>
  );
}
