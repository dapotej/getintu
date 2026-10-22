// Entry point for the single-page demo of the admin console. The pages are the real ones from
// src/app; only routing, Supabase and the API are swapped for in-browser stand-ins.
import { StrictMode, type ComponentType, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import AuthLayout from "../src/app/(auth)/layout";
import LoginPage from "../src/app/(auth)/login/page";
import SetPasswordPage from "../src/app/(auth)/set-password/page";
import TwoStepPage from "../src/app/(auth)/two-step/page";
import CataloguePage from "../src/app/(console)/catalogue/page";
import ImportPage from "../src/app/(console)/import/page";
import ConsoleLayout from "../src/app/(console)/layout";
import MemberPage from "../src/app/(console)/members/[id]/page";
import TestPassPage from "../src/app/(console)/members/[id]/passes/[membershipId]/page";
import VisitsPage from "../src/app/(console)/visits/page";
import MembersPage from "../src/app/(console)/members/page";
import Home from "../src/app/(console)/page";
import PartnerPage from "../src/app/(console)/partners/[id]/page";
import PartnersPage from "../src/app/(console)/partners/page";
import PlanPage from "../src/app/(console)/plans/[id]/page";
import PlansPage from "../src/app/(console)/plans/page";
import StaffRedirect from "../src/app/(console)/staff/page";
import SettingsPage from "../src/app/(console)/settings/page";
import TeamPage from "../src/app/(console)/settings/team/page";
import RatesPage from "../src/app/(console)/settings/rates/page";
import VenuePage from "../src/app/(console)/partners/[id]/venues/[venueId]/page";
import { handle } from "./backend";
import { ParamsContext, useLocation } from "./router";

// Route the console's API calls to the in-browser stand-in.
const realFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, location.href);
  if (!url.pathname.startsWith("/admin/")) return realFetch(input, init);
  const res = await handle(init?.method ?? "GET", url, init?.body ? JSON.parse(String(init.body)) : undefined);
  return new Response(JSON.stringify(res.json), { status: res.status, headers: { "content-type": "application/json" } });
};
// The artifact viewer blocks browser dialogs; the demo has nothing to lose, so confirmations pass.
window.confirm = () => true;
window.prompt = () => "Demo: phone reported lost";
window.alert = () => {};

type Layout = ComponentType<{ children: ReactNode }>;
const ROUTES: [RegExp, ComponentType, Layout][] = [
  [/^\/login$/, LoginPage, AuthLayout],
  [/^\/two-step$/, TwoStepPage, AuthLayout],
  [/^\/set-password$/, SetPasswordPage, AuthLayout],
  [/^\/$/, Home, ConsoleLayout],
  [/^\/members$/, MembersPage, ConsoleLayout],
  [/^\/members\/(?<id>[^/]+)$/, MemberPage, ConsoleLayout],
  [/^\/members\/(?<id>[^/]+)\/passes\/(?<membershipId>[^/]+)$/, TestPassPage, ConsoleLayout],
  [/^\/visits$/, VisitsPage, ConsoleLayout],
  [/^\/plans$/, PlansPage, ConsoleLayout],
  [/^\/plans\/(?<id>[^/]+)$/, PlanPage, ConsoleLayout],
  [/^\/partners$/, PartnersPage, ConsoleLayout],
  [/^\/partners\/(?<id>[^/]+)$/, PartnerPage, ConsoleLayout],
  [/^\/catalogue$/, CataloguePage, ConsoleLayout],
  [/^\/partners\/(?<id>[^/]+)\/venues\/(?<venueId>[^/]+)$/, VenuePage, ConsoleLayout],
  [/^\/staff$/, StaffRedirect, ConsoleLayout],
  [/^\/settings$/, SettingsPage, ConsoleLayout],
  [/^\/settings\/team$/, TeamPage, ConsoleLayout],
  [/^\/settings\/rates$/, RatesPage, ConsoleLayout],
  [/^\/import$/, ImportPage, ConsoleLayout],
];

function App() {
  const path = (useLocation().split("?")[0] ?? "/").replace(/\/$/, "") || "/";
  for (const [re, Page, Layout] of ROUTES) {
    const m = path.match(re);
    if (!m) continue;
    return (
      <ParamsContext.Provider value={{ ...m.groups }}>
        <Layout>
          {/* Remount on every path so pages load fresh, as they do in the real app. */}
          <Page key={path} />
        </Layout>
      </ParamsContext.Provider>
    );
  }
  return <p className="p-10 text-sm">Page not found.</p>;
}

function Banner() {
  return (
    <div role="note" className="border-b border-day/30 bg-day/10 px-4 py-2 text-center text-xs text-day">
      Demo preview with TEST data. Sign in with any email and password, and any 6-digit code. Changes stay in this tab and reset when you reload.
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Banner />
    <App />
  </StrictMode>,
);
