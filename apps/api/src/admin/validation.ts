import { z } from "zod";
import { VENUE_TIERS } from "@intu/rules";

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$|^24:00$/, "Use HH:MM, 00:00 to 24:00");
const windows = z.array(z.object({ open: hhmm, close: hhmm }));
export const WeeklyHours = z.object({ "0": windows, "1": windows, "2": windows, "3": windows, "4": windows, "5": windows, "6": windows });

export const isoDate = z.iso.date();
export const uuid = z.uuid();
export const minorUnits = z.number().int().nonnegative();
export const currency = z.enum(["GBP", "USD", "NGN"]);
export const venueTier = z.enum(VENUE_TIERS);
export const idParam = z.object({ id: uuid });
export const offerModel = z.enum(["included", "included_or_add_on", "add_on", "member_privilege"]);
