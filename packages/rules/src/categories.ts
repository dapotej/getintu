// The catalogue is a tree of categories (C03 Beach & Water → C03-S01 Beach Clubs → C03-S01-T02
// Entry + F&B credit), and its codes nest, so a code covers itself and everything beneath it.

/** True when `benefitCode` is `offerCode` or one of its ancestors. */
export function covers(benefitCode: string, offerCode: string): boolean {
  return offerCode === benefitCode || offerCode.startsWith(`${benefitCode}-`);
}

/**
 * The plan benefit that applies to an offer: the most specific one covering the offer's category.
 * A plan can grant "2 beach club visits" and separately "1 cabana", and the cabana offer draws on
 * the cabana benefit.
 */
export function benefitFor<B extends { categoryCode: string }>(benefits: readonly B[], offerCode: string): B | null {
  return benefits.filter((b) => covers(b.categoryCode, offerCode)).sort((a, b) => b.categoryCode.length - a.categoryCode.length)[0] ?? null;
}

/**
 * Whether a plan's benefits include an offer at a venue of this tier: the same benefit and tier
 * checks a scan makes, without the day-to-day ones (dates, hours, allowance left, caps). The
 * member app uses it to mark what's included; the scan still decides on the night.
 */
export function includes<B extends { categoryCode: string; allowedVenueTiers: readonly string[] }>(benefits: readonly B[], offerCode: string, venueTier: string): boolean {
  const benefit = benefitFor(benefits, offerCode);
  return benefit !== null && benefit.allowedVenueTiers.includes(venueTier);
}

export const USAGE_MODES = ["door", "booking", "airport", "call", "concierge", "in_app"] as const;
export type UsageMode = (typeof USAGE_MODES)[number];

/**
 * How members use a catalogue entry: its own setting, else the nearest one above it, else the door.
 * `modes` holds the settings by code; entries without one are left out or null.
 */
export function usageModeOf(code: string, modes: ReadonlyMap<string, UsageMode | null>): UsageMode {
  const parts = code.split("-");
  for (let i = parts.length; i > 0; i--) {
    const mode = modes.get(parts.slice(0, i).join("-"));
    if (mode) return mode;
  }
  return "door";
}

/** Nightlife & Social is the night side of intu; everything else is day. */
export const isNight = (code: string) => covers("C06", code);
