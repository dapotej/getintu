"use client";
// Where a partner is paid. The bank confirms the account holder's name before it's saved; the
// account number is kept encrypted and only its last four digits are shown again.
import { Button, Card, DetailList, Field, Input, Notice, Select, SidePanel } from "@intu/ui";
import { ActionForm, text } from "@/components/forms";
import { api, useApi } from "@/lib/api";
import type { Partner, PayoutAccount } from "@/lib/types";

export function PayoutAccountCard({ partner, writable, onSaved }: { partner: Partner; writable: boolean; onSaved: () => void }) {
  const set = partner.payoutRecipientCode !== null;
  return (
    <Card
      title="Payout account"
      description="Where intu pays this partner's statements, in naira."
      actions={
        writable ? (
          <SidePanel
            title={set ? "Change the payout account" : "Add the payout account"}
            description="The bank confirms the account holder's name before it's saved. Statements approved but not yet paid go back to draft, so an approver checks them against the new account."
            trigger={(open) => (
              <Button size="sm" tone="secondary" onClick={open}>
                {set ? "Change" : "Add account"}
              </Button>
            )}
          >
            {(close) => <AccountForm partnerId={partner.id} onDone={() => (onSaved(), close())} />}
          </SidePanel>
        ) : null
      }
    >
      {set ? (
        <DetailList
          items={[
            ["Account name", partner.payoutAccountName],
            ["Bank", partner.payoutBankName],
            ["Account", `•••• ${partner.payoutAccountLast4 ?? ""}`],
          ]}
        />
      ) : (
        <p className="text-sm text-muted">Not set yet. Statements can be approved, but not paid, until it is.</p>
      )}
    </Card>
  );
}

function AccountForm({ partnerId, onDone }: { partnerId: string; onDone: () => void }) {
  const banks = useApi<{ banks: { name: string; code: string }[]; test: boolean }>("/admin/payout-banks");
  return (
    <ActionForm
      action={async (form) => {
        const res = await api<{ payoutAccount: PayoutAccount; sentBack: number }>(`/admin/partners/${partnerId}/bank-account`, { method: "PUT", body: { bankCode: text(form, "bankCode"), accountNumber: text(form, "accountNumber") } });
        alert(`Saved: ${res.payoutAccount.accountName}, ${res.payoutAccount.bankName}.${res.sentBack ? ` ${res.sentBack} approved statement${res.sentBack === 1 ? "" : "s"} went back to draft for a fresh approval.` : ""}`);
        onDone();
      }}
    >
      {(busy) => (
        <>
          {banks.error ? <Notice>{banks.error}</Notice> : null}
          {banks.data?.test ? <Notice tone="warning">TEST payouts: no Paystack key is set, so no money moves. Any 10-digit number works.</Notice> : null}
          <Field label="Bank">
            <Select name="bankCode" required defaultValue="">
              <option value="" disabled>
                {banks.data ? "Choose the bank" : "Loading banks…"}
              </option>
              {banks.data?.banks.map((b) => (
                <option key={b.code} value={b.code}>
                  {b.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Account number" hint="The 10-digit NUBAN.">
            <Input name="accountNumber" required inputMode="numeric" pattern="\d{10}" maxLength={10} autoComplete="off" className="w-44" />
          </Field>
          <Button type="submit" disabled={busy || !banks.data}>
            {busy ? "Checking with the bank…" : "Check and save"}
          </Button>
        </>
      )}
    </ActionForm>
  );
}
