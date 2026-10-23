"use client";
import { Field, Input, Select } from "@intu/ui";
import { CategorySelect } from "@/components/category-select";
import { locationText } from "@/components/forms";
import type { Venue } from "@/lib/types";

export type VenueKind = Venue["kind"];

export const VENUE_KIND_LABELS: Record<VenueKind, string> = {
  place: "A place members visit",
  visiting: "A service that comes to them",
  remote: "A service by phone or video",
};

/** "venue" for a place, "service" for one that comes to members or is by phone. */
export const venueNoun = (kind: VenueKind) => (kind === "place" ? "venue" : "service");

/**
 * The fields that depend on what a venue is: a place has a map location, a phone service has the
 * line members call, and the catalogue entry it's listed under is a kind of place or of service.
 */
export function VenueTypeFields({ kind, onKind, venue }: { kind: VenueKind; onKind: (k: VenueKind) => void; venue?: Venue }) {
  return (
    <>
      <Field label="Type" hint="A service that comes to them only scans against a booking. A phone service has nothing to scan.">
        <Select name="kind" value={kind} onChange={(e) => onKind(e.target.value as VenueKind)}>
          {(Object.keys(VENUE_KIND_LABELS) as VenueKind[]).map((k) => (
            <option key={k} value={k}>
              {VENUE_KIND_LABELS[k]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={kind === "place" ? "Kind of place" : "Kind of service"} hint={kind === "place" ? "From the catalogue, e.g. Beach Clubs. It's where the venue shows in the app." : "From the catalogue, e.g. Doctor on call. It's where the service shows in the app."}>
        <CategorySelect name="categoryId" placesOnly required defaultValue={venue?.categoryId} />
      </Field>
      {kind === "remote" ? (
        <Field label="Service line" hint="The number members call, e.g. +2348012345678.">
          <Input name="servicePhone" type="tel" required defaultValue={venue?.servicePhone ?? ""} />
        </Field>
      ) : null}
      {kind === "place" ? (
        <Field label="Map location" hint="Latitude, longitude, e.g. 6.4262, 3.4486. In Google Maps, right-click the venue and click the numbers to copy them.">
          <Input name="location" defaultValue={venue ? locationText(venue) : ""} placeholder="6.4262, 3.4486" />
        </Field>
      ) : null}
    </>
  );
}
