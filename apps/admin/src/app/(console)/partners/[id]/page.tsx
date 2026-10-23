"use client";
import { Badge, Button, Card, Checkbox, DetailList, EmptyState, Field, Icon, Input, PageHeader, Select, SidePanel, Table, Td } from "@intu/ui";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { ActionForm, checked, readLocation, text, textOrNull } from "@/components/forms";
import { HoursEditor, readHours } from "@/components/hours";
import { api, useApi } from "@/lib/api";
import { useStaff } from "@/lib/auth";
import { VenueTypeFields, venueNoun, type VenueKind } from "@/components/venue-fields";
import { useCatalogue } from "@/lib/catalogue";
import type { Partner, Venue } from "@/lib/types";

export default function PartnerPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useStaff();
  const writable = can("partners.write");
  const router = useRouter();
  const { data, error, setData } = useApi<{ partner: Partner; venues: Venue[] }>(`/admin/partners/${id}`);
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
            title="Venues and services"
            description="Places members visit, and services that come to them or are by phone. Each has its own hours, tier and offers."
            flush
            actions={
              writable ? (
                <SidePanel
                  title="Add a venue or service"
                  description="A place members visit, a service that comes to them, or a service by phone or video."
                  trigger={(open) => (
                    <Button size="sm" tone="secondary" onClick={open}>
                      <Icon name="plus" className="size-4" /> Add venue or service
                    </Button>
                  )}
                >
                  {() => <AddVenueForm partnerId={id} onAdded={(venueId) => router.push(`/partners/${id}/venues/${venueId}`)} />}
                </SidePanel>
              ) : null
            }
          >
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
                        {v.kind === "visiting" ? "Visiting service · " : v.kind === "remote" ? "By phone or video · " : ""}
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

        <Card
          title="Business details"
          actions={
            writable ? (
              <SidePanel
                title="Edit business details"
                trigger={(open) => (
                  <Button size="sm" tone="secondary" onClick={open}>
                    <Icon name="edit" className="size-4" /> Edit
                  </Button>
                )}
              >
                {(close) => (
                  <ActionForm
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
                      close();
                    }}
                  >
                    {(busy) => (
                      <>
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
              ["Legal name", p.legalName],
              ["Trading name", p.tradingName],
              ["Contact", p.contactName],
              ["Email", p.contactEmail],
              ["Phone", p.contactPhone],
              ["Settlement terms", p.settlementTerms],
              ["Bank details", p.hasBankDetails ? "On file" : "Not yet"],
            ]}
          />
        </Card>
      </div>
    </>
  );
}

/** Adds a venue or service; the fields follow its type. */
function AddVenueForm({ partnerId, onAdded }: { partnerId: string; onAdded: (venueId: string) => void }) {
  const [kind, setKind] = useState<VenueKind>("place");
  return (
    <ActionForm
      action={async (form) => {
        const { venue } = await api<{ venue: Venue }>("/admin/venues", {
          method: "POST",
          body: { partnerId, name: text(form, "name"), area: text(form, "area"), city: text(form, "city"), categoryId: text(form, "categoryId"), kind: text(form, "kind"), tier: text(form, "tier"), openingHours: readHours(form, "hours"), ...readLocation(form, "location"), servicePhone: textOrNull(form, "servicePhone") },
        });
        onAdded(venue.id);
      }}
    >
      {(busy) => (
        <>
          <Field label="Name" hint={kind === "place" ? "e.g. Atlantic Shore Oniru" : kind === "visiting" ? "e.g. Coastal Rides chauffeurs" : "e.g. CareLine 24/7 doctor line"}>
            <Input name="name" required />
          </Field>
          <VenueTypeFields kind={kind} onKind={setKind} />
          <Field label="Area" hint={kind === "place" ? "Where it is" : "Where it serves, e.g. Lagos"}>
            <Input name="area" placeholder={kind === "place" ? "Oniru" : "Lagos"} required />
          </Field>
          <Field label="City">
            <Select name="city">
              <option value="lagos">Lagos</option>
              <option value="abuja">Abuja</option>
            </Select>
          </Field>
          <Field label="Tier" hint="Top-tier venues are only open to plans whose benefits include them.">
            <Select name="tier">
              <option value="standard">Standard</option>
              <option value="top">Top tier</option>
            </Select>
          </Field>
          <HoursEditor name="hours" />
          <Button type="submit" disabled={busy}>
            Add {venueNoun(kind)}
          </Button>
        </>
      )}
    </ActionForm>
  );
}
