"use client";
import { Select } from "@intu/ui";
import type { SelectHTMLAttributes } from "react";
import { useCatalogue } from "@/lib/catalogue";

/**
 * Picks a catalogue entry. For a plan benefit any level will do ("all Beach Clubs"); an offer
 * needs a single service type, so the other rows show as headings only.
 */
export function CategorySelect({ servicesOnly, exclude, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { servicesOnly?: boolean; exclude?: string[] }) {
  const { ordered } = useCatalogue();
  return (
    <Select {...props}>
      <option value="">Choose…</option>
      {ordered
        .filter(({ c }) => c.active)
        .map(({ c, depth }) => (
          <option key={c.id} value={c.id} disabled={(servicesOnly && c.level !== "service") || exclude?.includes(c.id)}>
            {" ".repeat(depth)}
            {c.name}
            {c.level === "category" ? " (all)" : c.level === "subcategory" && !servicesOnly ? " (all)" : ""}
          </option>
        ))}
    </Select>
  );
}
