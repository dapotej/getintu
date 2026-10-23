"use client";
import { Badge, Button, Card, Checkbox, DetailList, EmptyState, Field, formatMoney, Icon, Input, minorToMajorInput, PageHeader, parseMajorToMinor, Select, SidePanel, Table, Td, Textarea } from "@intu/ui";
import { CategorySelect } from "@/components/category-select";
import { PartnerStaffCard } from "@/components/partner-staff";
import { markup, OFFER_MODELS, useCatalogue } from "@/lib/catalogue";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ActionForm, checked, intOrNull, locationText, readLocation, text, textOrNull } from "@/components/forms";
import { HoursEditor, HoursSummary, readHours } from "@/components/hours";
import { api, useApi } from "@/lib/api";
import { useStaff } from "@/lib/auth";
import type { Offer, Venue } from "@/lib/types";

const naira = (form: FormData, name: string, label: string) => {
  const minor = parseMajorToMinor(text(form, name));
  if (minor === null) throw new Error(`Enter the ${label} in naira, e.g. 18000`);
  return minor;
};
const nairaOrNull = (form: FormData, name: string, label: string) => (text(form, name) ? naira(form, name, label) : null);

export default function VenuePage() {
  const { id: partnerId, venueId: id } = useParams<{ id: string; venueId: string }>();
  const { can } = useStaff();
  const writable = can("partners.write");
  const { byId } = useCatalogue();
  const { data, error, reload } = useApi<{ venue: Venue; partner: { id: string; tradingName: string }; offers: Offer[] }>(`/admin/venues/${id}`);
  if (error) return <p className="text-sm text-danger">{error}</p>;
  if (!data) return <p className="text-sm text-muted">Loading…</p>;
  const { venue, partner, offers } = data;
  const taken = offers.map((o) => o.categoryId);

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href={`/partners/${partnerId}`} className="inline-flex items-center gap-1 hover:text-fg">
            <Icon name="back" className="size-4" /> {partner.tradingName}
          </Link>
        }
        title={venue.name}
        subtitle={`${venue.area}, ${venue.city === "lagos" ? "Lagos" : "Abuja"}${venue.externalRef ? ` · pilot ID ${venue.externalRef}` : ""}${venue.isTest ? " · TEST" : ""}`}
        actions={
          <>
            {venue.kind === "visiting" ? <Badge tone="accent">Visiting service</Badge> : venue.kind === "remote" ? <Badge tone="accent">By phone or video</Badge> : null}
            <Badge tone={venue.tier === "top" ? "day" : "neutral"}>{venue.tier === "top" ? "Top tier" : "Standard tier"}</Badge>
          </>
        }
      />
      <div className="flex flex-col gap-6">
        <Card
          title="Venue"
          actions={
            writable ? (
              <SidePanel
                title="Edit venue"
                trigger={(open) => (
                  <Button size="sm" tone="secondary" onClick={open}>
                    <Icon name="edit" className="size-4" /> Edit
                  </Button>
                )}
              >
                {(close) => <VenueForm venue={venue} onSaved={() => (reload(), close())} />}
              </SidePanel>
            ) : null
          }
        >
          <DetailList
            items={[
              ["How members use it", venue.kind === "visiting" ? "A service that comes to them (booked)" : venue.kind === "remote" ? "A service by phone or video" : "A place members visit"],
              ...(venue.kind === "remote" ? [["Service line", venue.servicePhone] as [string, string | null]] : []),
              ["Kind of place", byId.get(venue.categoryId)?.name],
              ["Tier", venue.tier === "top" ? "Top tier" : "Standard"],
              ["Status", venue.active ? "Active" : "Inactive: declines every scan"],
              ["Description", venue.description],
              ["Capacity notes", venue.capacityNotes],
              [
                "Map location",
                venue.latitude !== null && venue.longitude !== null ? (
                  <a key="map" href={`https://www.google.com/maps/search/?api=1&query=${venue.latitude},${venue.longitude}`} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                    {locationText(venue)}
                  </a>
                ) : venue.kind !== "place" ? (
                  "None: it isn't a place"
                ) : (
                  <span key="map" className="text-day">Not set: it won&apos;t show on the member app&apos;s map</span>
                ),
              ],
              ["Opening hours", <HoursSummary key="hours" value={venue.openingHours} />],
            ]}
          />
        </Card>

        <Card
          title="Offers"
          description="What the venue gives for each benefit, and what intu pays per approved visit."
          flush
          actions={
            writable ? (
              <SidePanel
                title="Add an offer"
                description="The single service type this venue delivers, and what intu pays for it."
                trigger={(open) => (
                  <Button size="sm" tone="secondary" onClick={open}>
                    <Icon name="plus" className="size-4" /> Add offer
                  </Button>
                )}
              >
                {(close) => <OfferForm venueId={id} exclude={taken} onSaved={() => (reload(), close())} />}
              </SidePanel>
            ) : null
          }
        >
          {offers.length === 0 ? (
            <EmptyState title="No offers yet">{writable ? "Add one so members can use this venue." : null}</EmptyState>
          ) : (
            <Table head={["Service", "Cost", "Retail", "Markup", "How it's offered", "Daily cap", ""]}>
              {offers.map((o) => (
                <OfferRow key={o.id} offer={o} writable={writable} onChange={reload} />
              ))}
            </Table>
          )}
        </Card>

        {/* A service by phone has nothing to scan. */}
        {venue.kind !== "remote" ? <PartnerStaffCard venueId={id} writable={writable} /> : null}
      </div>
    </>
  );
}

function VenueForm({ venue, onSaved }: { venue: Venue; onSaved: () => void }) {
  return (
    <ActionForm
      action={async (form) => {
        await api(`/admin/venues/${venue.id}`, {
          method: "PATCH",
          body: {
            name: text(form, "name"),
            area: text(form, "area"),
            kind: text(form, "kind"),
            categoryId: text(form, "categoryId"),
            tier: text(form, "tier"),
            description: textOrNull(form, "description"),
            capacityNotes: textOrNull(form, "capacityNotes"),
            openingHours: readHours(form, "hours"),
            ...readLocation(form, "location"),
            servicePhone: textOrNull(form, "servicePhone"),
            active: checked(form, "active"),
          },
        });
        onSaved();
      }}
    >
      {(busy) => (
        <>
          <Field label="Name">
            <Input name="name" defaultValue={venue.name} required />
          </Field>
          <Field label="Area">
            <Input name="area" defaultValue={venue.area} required />
          </Field>
          <Field label="How members use it" hint="A visiting service comes to the member and only scans against a booking. A phone service (doctor on call) has nothing to scan.">
            <Select name="kind" defaultValue={venue.kind}>
              <option value="place">A place members visit</option>
              <option value="visiting">A service that comes to them (booked)</option>
              <option value="remote">A service by phone or video</option>
            </Select>
          </Field>
          <Field label="Kind of place" hint="From the catalogue. The services it gives are its offers.">
            <CategorySelect name="categoryId" placesOnly required defaultValue={venue.categoryId} />
          </Field>
          <Field label="Tier" hint="Which plans can use it is set on each plan's benefits.">
            <Select name="tier" defaultValue={venue.tier}>
              <option value="standard">Standard</option>
              <option value="top">Top tier</option>
            </Select>
          </Field>
          <Field label="Service line" hint="For a service by phone or video: the number members call, e.g. +2348012345678.">
            <Input name="servicePhone" type="tel" defaultValue={venue.servicePhone ?? ""} />
          </Field>
          <Field label="Map location" hint="Latitude, longitude. In Google Maps, right-click the venue and click the numbers to copy them.">
            <Input name="location" defaultValue={locationText(venue)} placeholder="6.4262, 3.4486" />
          </Field>
          <Field label="Description">
            <Textarea name="description" defaultValue={venue.description ?? ""} />
          </Field>
          <Field label="Capacity notes">
            <Input name="capacityNotes" defaultValue={venue.capacityNotes ?? ""} />
          </Field>
          <HoursEditor name="hours" value={venue.openingHours} />
          <Checkbox name="active" defaultChecked={venue.active} label="Active" hint="Inactive venues decline every scan." />
          <Button type="submit" disabled={busy}>
            Save venue
          </Button>
        </>
      )}
    </ActionForm>
  );
}

/** Adds an offer, or edits one when given it. */
function OfferForm({ venueId, offer: o, exclude, onSaved }: { venueId?: string; offer?: Offer; exclude?: string[]; onSaved: () => void }) {
  return (
    <ActionForm
      action={async (form) => {
        const prices = {
          rateMinor: naira(form, "rate", "cost"),
          retailMinor: nairaOrNull(form, "retail", "retail price"),
          offerModel: text(form, "offerModel"),
          pricesArePlaceholders: checked(form, "placeholder"),
          dailyCap: intOrNull(form, "dailyCap"),
        };
        if (o) {
          await api(`/admin/offers/${o.id}`, { method: "PATCH", body: { ...prices, validFrom: textOrNull(form, "validFrom"), validTo: textOrNull(form, "validTo"), active: checked(form, "active") } });
        } else {
          if (!text(form, "categoryId")) throw new Error("Choose the service this offer delivers");
          await api("/admin/offers", { method: "POST", body: { venueId, categoryId: text(form, "categoryId"), ...prices } });
        }
        onSaved();
      }}
    >
      {(busy) => (
        <>
          {o ? null : (
            <Field label="Service" hint="The single service type this venue delivers">
              <CategorySelect name="categoryId" servicesOnly exclude={exclude ?? []} />
            </Field>
          )}
          <Field label="Rate (₦ per visit)" hint="Cost price: what intu pays">
            <Input name="rate" inputMode="decimal" defaultValue={o ? minorToMajorInput(o.rateMinor) : ""} required />
          </Field>
          <Field label="Retail (₦)" hint="What a member pays as an add-on">
            <Input name="retail" inputMode="decimal" defaultValue={o?.retailMinor == null ? "" : minorToMajorInput(o.retailMinor)} />
          </Field>
          <Field label="How it's offered">
            <Select name="offerModel" defaultValue={o?.offerModel ?? "included"}>
              {Object.entries(OFFER_MODELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Daily cap">
            <Input name="dailyCap" type="number" min={1} placeholder="No cap" defaultValue={o?.dailyCap ?? ""} />
          </Field>
          {o ? (
            <>
              <Field label="Valid from">
                <Input name="validFrom" type="date" defaultValue={o.validFrom ?? ""} />
              </Field>
              <Field label="Valid to">
                <Input name="validTo" type="date" defaultValue={o.validTo ?? ""} />
              </Field>
            </>
          ) : null}
          <Checkbox name="placeholder" defaultChecked={o?.pricesArePlaceholders ?? false} label="Prices are placeholders" />
          {o ? <Checkbox name="active" defaultChecked={o.active} label="Active" /> : null}
          <Button type="submit" disabled={busy}>
            {o ? "Save offer" : "Add offer"}
          </Button>
        </>
      )}
    </ActionForm>
  );
}

function OfferRow({ offer: o, writable, onChange }: { offer: Offer; writable: boolean; onChange: () => void }) {
  const { path } = useCatalogue();
  return (
    <tr>
      <Td>
        <p className="font-semibold">{o.category.name}</p>
        <p className="text-xs text-muted">{path(o.category.code).split(" › ").slice(0, -1).join(" › ")}</p>
      </Td>
      <Td className="whitespace-nowrap tabular-nums">{formatMoney(o.rateMinor, o.rateCurrency)}</Td>
      <Td className="whitespace-nowrap tabular-nums">{o.retailMinor === null ? <span className="text-faint">–</span> : formatMoney(o.retailMinor, o.rateCurrency)}</Td>
      <Td className="whitespace-nowrap tabular-nums">
        {markup(o.rateMinor, o.retailMinor) ?? <span className="text-faint">–</span>}
        {o.pricesArePlaceholders ? (
          <span className="ml-2">
            <Badge tone="day">Placeholder</Badge>
          </span>
        ) : null}
      </Td>
      <Td className="text-muted">{OFFER_MODELS[o.offerModel]}</Td>
      <Td className="tabular-nums">{o.dailyCap ?? <span className="text-faint">No cap</span>}</Td>
      <Td className="text-right">
        <div className="flex items-center justify-end gap-2">
          {!o.active ? (
            <Badge dot tone="danger">
              Inactive
            </Badge>
          ) : null}
          {writable ? (
            <SidePanel
              title={`Edit ${o.category.name}`}
              description={path(o.category.code) || undefined}
              trigger={(open) => (
                <Button size="sm" tone="ghost" onClick={open}>
                  Edit
                </Button>
              )}
            >
              {(close) => <OfferForm offer={o} onSaved={() => (onChange(), close())} />}
            </SidePanel>
          ) : null}
        </div>
      </Td>
    </tr>
  );
}
