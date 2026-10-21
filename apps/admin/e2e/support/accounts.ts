// TEST staff accounts the e2e tests sign in as. Fixed ids so the global setup can create them.
export const ACCOUNTS = {
  founder: { authUserId: "00000000-0000-4000-8000-00000000e2e1", email: "e2e-founder@example.com", password: "TEST-password-founder", role: "founder", fullName: "TEST Founder Eze" },
  concierge: { authUserId: "00000000-0000-4000-8000-00000000e2e2", email: "e2e-concierge@example.com", password: "TEST-password-concierge", role: "concierge", fullName: "TEST Concierge Bisi" },
  outsider: { authUserId: "00000000-0000-4000-8000-00000000e2e3", email: "e2e-outsider@example.com", password: "TEST-password-outsider", role: null, fullName: "TEST Not Staff" },
} as const;
