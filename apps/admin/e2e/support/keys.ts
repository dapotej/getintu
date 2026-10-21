// TEST ONLY. A throwaway signing key for end-to-end tests, standing in for Supabase Auth.
// The API trusts it only when started with NODE_ENV=test and TEST_JWKS_JSON (see playwright.config.ts).
export const E2E_PUBLIC_JWK = {"kty":"EC","x":"LrfqOBiqTETHwD-3uz4UZ9YvdPB9DJA_N2F62Ge_Zng","y":"Q9qIg57esVV86b_thSPEUalW2OrWcNs8pNSoIzLtjpA","crv":"P-256","kid":"intu-e2e-test","alg":"ES256","use":"sig"} as const;
export const E2E_PRIVATE_JWK = {"kty":"EC","x":"LrfqOBiqTETHwD-3uz4UZ9YvdPB9DJA_N2F62Ge_Zng","y":"Q9qIg57esVV86b_thSPEUalW2OrWcNs8pNSoIzLtjpA","crv":"P-256","d":"Rdx1LQ4aOPA9A-dWj5jIHZ2rXrbGD2EE0w11IqrZlCE","kid":"intu-e2e-test","alg":"ES256"} as const;
