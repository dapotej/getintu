"use client";
import { Badge, Button, Card, Checkbox, EmptyState, Field, formatMoney, Icon, Input, minorToMajorInput, PageHeader, parseMajorToMinor, Select, Table, Td, Textarea } from "@intu/ui";
import { CategorySelect } from "@/components/category-select";
import { markup, OFFER_MODELS, useCatalogue } from "@/lib/catalogue";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { ActionForm, checked, intOrNull, text, textOrNull } from "@/components/forms";
import { HoursEditor, readHours } from "@/components/hours";
import { api, useApi } from "@/lib/api";
import { useStaff } from "@/lib/auth";
import type { Offer, Venue } from "@/lib/types";
import { CATEGORIES } from "@/lib/labels";

const naira = (form: FormData, name: string, label: string) => {
  const minor = parseMajorToMinor(text(form, name));
  if (minor === null) throw new Error(`Enter the ${label} in naira, e.g. 18000`);
  return minor;
};
const nairaOrNull = (form: FormData, name: string, label: string) => (text(form, name) ? naira(form, name, label) : null);

export default function VenuePage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useStaff();
  const writable = can("partners.write");
  const { data, error, reload } = useApi<{ venue: Venue; offers: Offer[] }>(`/admin/venues/${id}`);
  if (error) return <p className="text-sm text-danger">{error}</p>;
  if (!data) return <p className="text-sm text-muted">Loading…</p>;
  const { venue, offers } = data;
  const taken = offers.map((o) => o.categoryId);

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/partners" className="inline-flex items-center gap-1 hover:text-fg">
            <Icon name="back" className="size-4" /> Partners and venues
          </Link>
        }
        title={venue.name}
        subtitle={`${venue.area}, ${venue.city === "lagos" ? "Lagos" : "Abuja"}${venue.externalRef ? ` · pilot ID ${venue.externalRef}` : ""}${venue.isTest ? " · TEST" : ""}`}
        actions={<Badge tone={venue.tier === "top" ? "day" : "neutral"}>{venue.tier === "top" ? "Top tier" : "Standard tier"}</Badge>}
      />
      <div className="flex flex-col gap-6">
        <Card title="Venue">
          <ActionForm
            success="Saved."
            action={async (form) => {
              await api(`/admin/venues/${id}`, {
                method: "PATCH",
                body: {
                  name: text(form, "name"),
                  area: text(form, "area"),
                  category: text(form, "category"),
                  tier: text(form, "tier"),
                  description: textOrNull(form, "description"),
                  capacityNotes: textOrNull(form, "capacityNotes"),
                  openingHours: readHours(form, "hours"),
                  active: checked(form, "active"),
                },
              });
              reload();
            }}
          >
            {(busy) => (
              <fieldset disabled={!writable} className="flex flex-col gap-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Name">
                    <Input name="name" defaultValue={venue.name} required />
                  </Field>
                  <Field label="Area">
                    <Input name="area" defaultValue={venue.area} required />
                  </Field>
                  <Field label="Category">
                    <Select name="category" defaultValue={venue.category}>
                      {Object.entries(CATEGORIES).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Tier" hint="Which plans can use it is set on each plan's benefits.">
                    <Select name="tier" defaultValue={venue.tier}>
                      <option value="standard">Standard</option>
                      <option value="top">Top tier</option>
                    </Select>
                  </Field>
                </div>
                <Field label="Description">
                  <Textarea name="description" defaultValue={venue.description ?? ""} />
                </Field>
                <Field label="Capacity notes">
                  <Input name="capacityNotes" defaultValue={venue.capacityNotes ?? ""} />
                </Field>
                <HoursEditor name="hours" value={venue.openingHours} />
                <Checkbox name="active" defaultChecked={venue.active} label="Active" hint="Inactive venues decline every scan." />
                {writable ? (
                  <div>
                    <Button type="submit" disabled={busy}>
                      Save venue
                    </Button>
                  </div>
                ) : null}
              </fieldset>
            )}
          </ActionForm>
        </Card>

        <Card title="Offers" description="What the venue gives for each benefit, and what intu pays per approved visit." flush>
          {offers.length === 0 ? (
            <EmptyState title="No offers yet">Add one below so members can use this venue.</EmptyState>
          ) : (
            <Table head={["Service", "Cost", "Retail", "Markup", "How it's offered", "Daily cap", ""]}>
              {offers.map((o) => (
                <OfferRow key={o.id} offer={o} writable={writable} onChange={reload} />
              ))}
            </Table>
          )}
          {writable ? (
            <ActionForm
              className="grid gap-4 border-t border-line bg-subtle/60 px-5 py-4 sm:grid-cols-2 lg:grid-cols-3"
              action={async (form) => {
                if (!text(form, "categoryId")) throw new Error("Choose the service this offer delivers");
                await api("/admin/offers", {
                  method: "POST",
                  body: {
                    venueId: id,
                    categoryId: text(form, "categoryId"),
                    rateMinor: naira(form, "rate", "cost"),
                    retailMinor: nairaOrNull(form, "retail", "retail price"),
                    offerModel: text(form, "offerModel"),
                    pricesArePlaceholders: checked(form, "placeholder"),
                    dailyCap: intOrNull(form, "dailyCap"),
                  },
                });
                reload();
              }}
            >
              {(busy) => (
                <>
                  <div className="sm:col-span-2 lg:col-span-3">
                    <Field label="Add offer" hint="The single service type this venue delivers">
                      <CategorySelect name="categoryId" servicesOnly exclude={taken} />
                    </Field>
                  </div>
                  <Field label="Rate (₦ per visit)" hint="Cost price: what intu pays">
                    <Input name="rate" inputMode="decimal" required />
                  </Field>
                  <Field label="Retail (₦)" hint="What a member pays as an add-on">
                    <Input name="retail" inputMode="decimal" />
                  </Field>
                  <Field label="How it's offered">
                    <Select name="offerModel" defaultValue="included">
                      {Object.entries(OFFER_MODELS).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Daily cap">
                    <Input name="dailyCap" type="number" min={1} placeholder="No cap" />
                  </Field>
                  <div className="flex items-end pb-2">
                    <Checkbox name="placeholder" label="Prices are placeholders" />
                  </div>
                  <div className="flex items-end">
                    <Button type="submit" disabled={busy}>
                      Add offer
                    </Button>
                  </div>
                </>
              )}
            </ActionForm>
          ) : null}
        </Card>
      </div>
    </>
  );
}

function OfferRow({ offer: o, writable, onChange }: { offer: Offer; writable: boolean; onChange: () => void }) {
  const [editing, setEditing] = useState(false);
  const { path } = useCatalogue();
  if (!editing)
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
              <Button size="sm" tone="ghost" onClick={() => setEditing(true)}>
                Edit
              </Button>
            ) : null}
          </div>
        </Td>
      </tr>
    );
  return (
    <tr>
      <Td colSpan={7} className="bg-subtle/60">
        <ActionForm
          className="grid gap-4 py-2 sm:grid-cols-2 lg:grid-cols-3"
          action={async (form) => {
            await api(`/admin/offers/${o.id}`, {
              method: "PATCH",
              body: {
                rateMinor: naira(form, "rate", "cost"),
                retailMinor: nairaOrNull(form, "retail", "retail price"),
                offerModel: text(form, "offerModel"),
                pricesArePlaceholders: checked(form, "placeholder"),
                dailyCap: intOrNull(form, "dailyCap"),
                validFrom: textOrNull(form, "validFrom"),
                validTo: textOrNull(form, "validTo"),
                active: checked(form, "active"),
              },
            });
            setEditing(false);
            onChange();
          }}
        >
          {(busy) => (
            <>
              <p className="font-semibold sm:col-span-2 lg:col-span-3">{path(o.category.code) || o.category.name}</p>
              <Field label="Rate (₦ per visit)" hint="Cost price">
                <Input name="rate" inputMode="decimal" defaultValue={minorToMajorInput(o.rateMinor)} required />
              </Field>
              <Field label="Retail (₦)">
                <Input name="retail" inputMode="decimal" defaultValue={o.retailMinor === null ? "" : minorToMajorInput(o.retailMinor)} />
              </Field>
              <Field label="How it's offered">
                <Select name="offerModel" defaultValue={o.offerModel}>
                  {Object.entries(OFFER_MODELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Daily cap">
                <Input name="dailyCap" type="number" min={1} placeholder="No cap" defaultValue={o.dailyCap ?? ""} />
              </Field>
              <Field label="Valid from">
                <Input name="validFrom" type="date" defaultValue={o.validFrom ?? ""} />
              </Field>
              <Field label="Valid to">
                <Input name="validTo" type="date" defaultValue={o.validTo ?? ""} />
              </Field>
              <Checkbox name="placeholder" defaultChecked={o.pricesArePlaceholders} label="Prices are placeholders" />
              <Checkbox name="active" defaultChecked={o.active} label="Active" />
              <div className="flex gap-2 sm:col-span-2 lg:col-span-3">
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
