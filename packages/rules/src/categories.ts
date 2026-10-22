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

/** Nightlife & Social is the night side of intu; everything else is day. */
export const isNight = (code: string) => covers("C06", code);
