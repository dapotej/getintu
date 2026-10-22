"use client";
import { Select } from "@intu/ui";
import type { SelectHTMLAttributes } from "react";
import { useCatalogue } from "@/lib/catalogue";

/**
 * Picks a catalogue entry. For a plan benefit any level will do ("all Beach Clubs"); an offer
 * needs a single service type, so the other rows show as headings only. A venue is a kind of
 * place, so it picks from categories and subcategories without the service types.
 */
export function CategorySelect({ servicesOnly, placesOnly, exclude, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { servicesOnly?: boolean; placesOnly?: boolean; exclude?: string[] }) {
  const { ordered } = useCatalogue();
  return (
    <Select {...props}>
      <option value="">Choose…</option>
      {ordered
        .filter(({ c }) => c.active && !(placesOnly && c.level === "service"))
        .map(({ c, depth }) => (
          <option key={c.id} value={c.id} disabled={(servicesOnly && c.level !== "service") || exclude?.includes(c.id)}>
            {" ".repeat(depth)}
            {c.name}
            {placesOnly ? "" : c.level === "category" ? " (all)" : c.level === "subcategory" && !servicesOnly ? " (all)" : ""}
          </option>
        ))}
    </Select>
  );
}
