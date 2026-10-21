"use client";
import { Badge, Button, Card, Field, Input, PageHeader, Select, Table, Td } from "@intu/ui";
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
        subtitle="A partner is the business intu pays; each of its venues has a tier, opening hours and offers."
        actions={
          writable ? (
            <>
              <Button tone="secondary" onClick={() => setAdding(adding === "partner" ? null : "partner")}>
                Add partner
              </Button>
              <Button onClick={() => setAdding(adding === "venue" ? null : "venue")}>Add venue</Button>
            </>
          ) : null
        }
      />
      {adding === "partner" ? (
        <Card title="New partner" className="mb-6 max-w-xl">
          <ActionForm
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
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Contact name">
                    <Input name="contactName" />
                  </Field>
                  <Field label="Contact phone">
                    <Input name="contactPhone" type="tel" />
                  </Field>
                </div>
                <Field label="Contact email">
                  <Input name="contactEmail" type="email" />
                </Field>
                <Field label="Settlement terms">
                  <Input name="settlementTerms" placeholder="Monthly in arrears, bank transfer in naira" />
                </Field>
                <Button type="submit" disabled={busy}>
                  Add partner
                </Button>
              </>
            )}
          </ActionForm>
        </Card>
      ) : null}
      {adding === "venue" ? (
        <Card title="New venue" className="mb-6 max-w-2xl">
          <ActionForm
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
                <Field label="Partner">
                  <Select name="partnerId" required>
                    {partners.data?.partners.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.tradingName}
                      </option>
                    ))}
                  </Select>
                </Field>
                <div className="grid grid-cols-2 gap-3">
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
                  <Field label="Tier" hint="Top-tier venues are only open to plans that include them.">
                    <Select name="tier">
                      <option value="standard">Standard</option>
                      <option value="top">Top tier</option>
                    </Select>
                  </Field>
                </div>
                <HoursEditor name="hours" />
                <Button type="submit" disabled={busy}>
                  Add venue
                </Button>
              </>
            )}
          </ActionForm>
        </Card>
      ) : null}

      {partners.error ? <p className="text-sm text-pop">{partners.error}</p> : null}
      <div className="space-y-4">
        {partners.data?.partners.map((p) => (
          <Card
            key={p.id}
            title={p.tradingName}
            actions={
              <div className="flex gap-2">
                {p.isTest ? <Badge>TEST</Badge> : null}
                {!p.active ? <Badge tone="pop">inactive</Badge> : null}
                {p.hasBankDetails ? <Badge tone="night">bank details on file</Badge> : null}
              </div>
            }
          >
            <p className="mb-3 text-sm text-cream-muted">
              {p.legalName}
              {p.contactName ? ` · ${p.contactName}` : ""}
              {p.contactEmail ? ` · ${p.contactEmail}` : ""}
            </p>
            <Table head={["Venue", "Area", "Category", "Tier", ""]} empty={byPartner(p.id).length === 0 && "No venues yet."}>
              {byPartner(p.id).map((v) => (
                <tr key={v.id}>
                  <Td>
                    <Link href={`/venues/${v.id}`} className="font-semibold text-night hover:underline">
                      {v.name}
                    </Link>
                  </Td>
                  <Td className="text-cream-muted">{v.area}</Td>
                  <Td className="text-cream-muted">{CATEGORIES[v.category as keyof typeof CATEGORIES] ?? v.category}</Td>
                  <Td>
                    <Badge tone={v.tier === "top" ? "day" : "muted"}>{v.tier}</Badge>
                  </Td>
                  <Td>{!v.active ? <Badge tone="pop">inactive</Badge> : null}</Td>
                </tr>
              ))}
            </Table>
          </Card>
        ))}
      </div>
    </>
  );
}
