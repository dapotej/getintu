// The intu catalogue: categories → subcategories → service types, from the "Category Taxonomy"
// tab of Global_Access_Categories_and_Partner_Database (22 Oct 2026), with these changes:
// - 24-hour chauffeur sat under the wrong subcategory ID (C01-S07); it's C01-S03-T04 here.
// - C08-S02 is "Doctor on call" (the sheet also called it Healthcare Assistance), and C08-S03-T01
//   is "Doctor home visit", a separate product (Dapo, 22 Oct 2026).
// - Added for the December Pass, whose benefits the tab didn't cover yet (marked `added`):
//   C01-S01-T03 departure lounge, C04-S01-T02 hotel pool and gym, C04-S08 Golf,
//   C06-S01-T03 guest list and priority entry.
// The admin console can rename, hide and add entries; this list seeds every environment.

export interface TaxonomyNode {
  code: string;
  name: string;
  added?: true;
  children?: TaxonomyNode[];
}

const s = (code: string, name: string, extra: Partial<TaxonomyNode> = {}): TaxonomyNode => ({ code, name, ...extra });

export const TAXONOMY: TaxonomyNode[] = [
  s("C01", "Arrival & Travel", {
    children: [
      s("C01-S01", "Airport Protocol", { children: [s("C01-S01-T01", "Meet-and-assist"), s("C01-S01-T02", "Departure assistance"), s("C01-S01-T03", "Departure lounge visit", { added: true })] }),
      s("C01-S02", "Airport Transfers", { children: [s("C01-S02-T01", "Airport pickup"), s("C01-S02-T02", "Airport drop-off")] }),
      s("C01-S03", "Chauffeur & Car Hire", { children: [s("C01-S03-T01", "4-hour chauffeur"), s("C01-S03-T02", "8-hour chauffeur"), s("C01-S03-T03", "12-hour chauffeur"), s("C01-S03-T04", "24-hour chauffeur")] }),
      s("C01-S04", "Connectivity & eSIM", { children: [s("C01-S04-T01", "Visitor eSIM"), s("C01-S04-T02", "SIM activation")] }),
      s("C01-S05", "Payments & Currency", { children: [s("C01-S05-T01", "Visitor payment card"), s("C01-S05-T02", "Digital wallet")] }),
      s("C01-S06", "Travel Assistance", { children: [s("C01-S06-T01", "Arrival concierge"), s("C01-S06-T02", "Travel support")] }),
    ],
  }),
  s("C02", "Food & Drink", {
    children: [
      s("C02-S01", "Fine Dining", { children: [s("C02-S01-T01", "Preferred reservation"), s("C02-S01-T02", "Set menu")] }),
      s("C02-S02", "Casual Dining", { children: [s("C02-S02-T01", "Restaurant privilege")] }),
      s("C02-S03", "Brunch & Breakfast", { children: [s("C02-S03-T01", "Brunch package"), s("C02-S03-T02", "Breakfast delivery")] }),
      s("C02-S04", "Tasting Menus", { children: [s("C02-S04-T01", "Chef tasting menu")] }),
      s("C02-S05", "Private Chefs", { children: [s("C02-S05-T01", "Daily chef service"), s("C02-S05-T02", "Private dinner")] }),
      s("C02-S06", "Food Delivery", { children: [s("C02-S06-T01", "Restaurant delivery")] }),
      s("C02-S07", "Culinary Experiences", { children: [s("C02-S07-T01", "Food tour"), s("C02-S07-T02", "Cooking experience")] }),
    ],
  }),
  s("C03", "Beach & Water", {
    children: [
      s("C03-S01", "Beach Clubs", { children: [s("C03-S01-T01", "Entry only"), s("C03-S01-T02", "Entry + F&B credit"), s("C03-S01-T03", "Cabana/daybed")] }),
      s("C03-S02", "Beach Houses", { children: [s("C03-S02-T01", "Private beach house day")] }),
      s("C03-S03", "Houseboats", { children: [s("C03-S03-T01", "Houseboat experience")] }),
      s("C03-S04", "Boat Cruises", { children: [s("C03-S04-T01", "Group boat trip"), s("C03-S04-T02", "Sunset cruise")] }),
      s("C03-S05", "Yacht Charters", { children: [s("C03-S05-T01", "Private yacht charter")] }),
      s("C03-S06", "Water Sports", { children: [s("C03-S06-T01", "Jet ski"), s("C03-S06-T02", "Water activities")] }),
      s("C03-S07", "Waterfront Dining", { children: [s("C03-S07-T01", "Waterfront dining package")] }),
    ],
  }),
  s("C04", "Wellness & Fitness", {
    children: [
      s("C04-S01", "Gyms", { children: [s("C04-S01-T01", "Gym day pass"), s("C04-S01-T02", "Hotel pool and gym day pass", { added: true })] }),
      s("C04-S02", "Pilates & Yoga", { children: [s("C04-S02-T01", "Pilates session"), s("C04-S02-T02", "Yoga session")] }),
      s("C04-S03", "Padel & Tennis", { children: [s("C04-S03-T01", "Padel session"), s("C04-S03-T02", "Tennis session")] }),
      s("C04-S04", "Cycling & Spin", { children: [s("C04-S04-T01", "Spin session")] }),
      s("C04-S05", "Spa & Massage", { children: [s("C04-S05-T01", "Massage"), s("C04-S05-T02", "Body scrub")] }),
      s("C04-S06", "Wellness Experiences", { children: [s("C04-S06-T01", "Morning reset")] }),
      s("C04-S07", "Other Sports", { children: [s("C04-S07-T01", "Fitness class"), s("C04-S07-T02", "Sports activity")] }),
      s("C04-S08", "Golf", { added: true, children: [s("C04-S08-T01", "Golf round or lesson", { added: true })] }),
    ],
  }),
  s("C05", "Beauty & Grooming", {
    children: [
      s("C05-S01", "Hair & Braiding", { children: [s("C05-S01-T01", "Braiding"), s("C05-S01-T02", "Hair styling")] }),
      s("C05-S02", "Barbering", { children: [s("C05-S02-T01", "Haircut"), s("C05-S02-T02", "Home barber")] }),
      s("C05-S03", "Makeup", { children: [s("C05-S03-T01", "Makeup session")] }),
      s("C05-S04", "Nails", { children: [s("C05-S04-T01", "Manicure"), s("C05-S04-T02", "Pedicure")] }),
      s("C05-S05", "Lashes & Brows", { children: [s("C05-S05-T01", "Lash service"), s("C05-S05-T02", "Brow service")] }),
      s("C05-S06", "Body Treatments", { children: [s("C05-S06-T01", "Body scrub")] }),
      s("C05-S07", "Home Beauty Packages", { children: [s("C05-S07-T01", "Essential Groom"), s("C05-S07-T02", "Full Glam"), s("C05-S07-T03", "Reset Ritual")] }),
    ],
  }),
  s("C06", "Nightlife & Social", {
    children: [
      s("C06-S01", "Nightclubs", { children: [s("C06-S01-T01", "Club reservation"), s("C06-S01-T02", "Table booking"), s("C06-S01-T03", "Guest list and priority entry", { added: true })] }),
      s("C06-S02", "Lounges", { children: [s("C06-S02-T01", "Lounge reservation")] }),
      s("C06-S03", "Rooftops", { children: [s("C06-S03-T01", "Rooftop experience")] }),
      s("C06-S04", "Members' Clubs", { children: [s("C06-S04-T01", "Hosted member access")] }),
      s("C06-S05", "Live Music", { children: [s("C06-S05-T01", "Live music booking")] }),
      s("C06-S06", "Social Gatherings", { children: [s("C06-S06-T01", "Members' social")] }),
      s("C06-S07", "Nightlife Packages", { children: [s("C06-S07-T01", "Ultimate Night Out")] }),
    ],
  }),
  s("C07", "Arts & Experiences", {
    children: [
      s("C07-S01", "Art & Galleries", { children: [s("C07-S01-T01", "Art tour"), s("C07-S01-T02", "Gallery visit")] }),
      s("C07-S02", "Cinema", { children: [s("C07-S02-T01", "Private cinema package")] }),
      s("C07-S03", "Theatre & Shows", { children: [s("C07-S03-T01", "Theatre ticket")] }),
      s("C07-S04", "Cultural Tours", { children: [s("C07-S04-T01", "Cultural guide")] }),
      s("C07-S05", "City & Street Tours", { children: [s("C07-S05-T01", "Lagos street tour")] }),
      s("C07-S06", "Shopping & Styling", { children: [s("C07-S06-T01", "Personal shopping"), s("C07-S06-T02", "Shopping tour")] }),
      s("C07-S07", "Private & Group Experiences", { children: [s("C07-S07-T01", "Private group itinerary")] }),
    ],
  }),
  s("C08", "Lifestyle Services", {
    children: [
      s("C08-S01", "Concierge", { children: [s("C08-S01-T01", "WhatsApp concierge"), s("C08-S01-T02", "Reservations")] }),
      s("C08-S02", "Doctor on call", { children: [s("C08-S02-T01", "24/7 medical advice"), s("C08-S02-T02", "Referral support")] }),
      s("C08-S03", "Medical Services", { children: [s("C08-S03-T01", "Doctor home visit")] }),
      s("C08-S04", "Personal Assistance", { children: [s("C08-S04-T01", "Personal errands")] }),
      s("C08-S05", "Family Services", { children: [s("C08-S05-T01", "Family experience support")] }),
      s("C08-S06", "Home & Convenience Services", { children: [s("C08-S06-T01", "Laundry"), s("C08-S06-T02", "Home support")] }),
    ],
  }),
];

export type CategoryLevel = "category" | "subcategory" | "service";

/** The tree flattened, parents before children, with each node's sort order among its siblings. */
export function flattenTaxonomy(nodes: TaxonomyNode[] = TAXONOMY, parentCode: string | null = null): { code: string; parentCode: string | null; level: CategoryLevel; name: string; sortOrder: number; added: boolean }[] {
  return nodes.flatMap((n, i) => [
    { code: n.code, parentCode, level: (["category", "subcategory", "service"] as const)[n.code.split("-").length - 1] ?? "service", name: n.name, sortOrder: i + 1, added: n.added === true },
    ...flattenTaxonomy(n.children ?? [], n.code),
  ]);
}

/**
 * Where the platform's original fixed benefit types sit in the catalogue. Used once, by the
 * migration that moved benefits and offers onto categories.
 */
export const LEGACY_BENEFIT_TYPES: Record<string, { benefit: string; offer: string }> = {
  beach_club: { benefit: "C03-S01", offer: "C03-S01-T01" },
  pool_gym: { benefit: "C04-S01-T02", offer: "C04-S01-T02" },
  golf: { benefit: "C04-S08", offer: "C04-S08-T01" },
  spa: { benefit: "C04-S05", offer: "C04-S05-T01" },
  hosted_night: { benefit: "C06-S04-T01", offer: "C06-S04-T01" },
  lounge: { benefit: "C01-S01-T03", offer: "C01-S01-T03" },
  meet_assist: { benefit: "C01-S01-T01", offer: "C01-S01-T01" },
  guest_list: { benefit: "C06-S01-T03", offer: "C06-S01-T03" },
  priority_dining: { benefit: "C02-S01-T01", offer: "C02-S01-T01" },
  partner_meal: { benefit: "C02-S02", offer: "C02-S02-T01" },
  club_visit: { benefit: "C06-S04", offer: "C06-S04-T01" },
  esim_data: { benefit: "C01-S04-T01", offer: "C01-S04-T01" },
};
