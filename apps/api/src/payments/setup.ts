// Which payment client takes each currency, from the environment. Real Stripe or Paystack when
// their keys are set; otherwise the TEST provider, which is refused in production.
import { providerFor, type Currency } from "@intu/rules";
import { paystackPayouts, paystackProvider, stripeProvider, testPayouts, testProvider, type PaymentProviderClient, type Payments, type ProviderName } from "./providers.ts";

export interface PaymentSettings {
  apiUrl?: string | null;
  stripe?: { secretKey: string; webhookSecret: string } | undefined;
  paystack?: { secretKey: string } | undefined;
  /** TEST payments (a page on the API, no money) stand in for a provider without keys. */
  allowTest: boolean;
  fetch?: typeof fetch;
  now?: () => Date;
}

export function createPayments(s: PaymentSettings): Payments {
  const clients: Partial<Record<ProviderName, PaymentProviderClient>> = {};
  if (s.stripe) clients.stripe = stripeProvider({ ...s.stripe, ...(s.fetch ? { fetch: s.fetch } : {}), ...(s.now ? { now: s.now } : {}) });
  if (s.paystack) clients.paystack = paystackProvider({ ...s.paystack, ...(s.fetch ? { fetch: s.fetch } : {}) });
  if (s.allowTest) clients.test = testProvider();
  return {
    apiUrl: s.apiUrl ?? null,
    forCurrency(currency: Currency) {
      const client = clients[providerFor(currency)] ?? clients.test;
      if (!client) throw new Error(`No payment provider is set up for ${currency}`);
      return client;
    },
    byName: (name) => clients[name] ?? null,
    payouts: s.paystack ? paystackPayouts({ ...s.paystack, ...(s.fetch ? { fetch: s.fetch } : {}) }) : s.allowTest ? testPayouts() : null,
  };
}
