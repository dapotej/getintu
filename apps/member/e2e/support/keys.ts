// TEST ONLY. The throwaway keys the console and scanner tests use: one standing in for Supabase
// Auth, one signing passes. A local API trusts them only with NODE_ENV=test (see playwright.config.ts).
export const E2E_PUBLIC_JWK = {"kty":"EC","x":"LrfqOBiqTETHwD-3uz4UZ9YvdPB9DJA_N2F62Ge_Zng","y":"Q9qIg57esVV86b_thSPEUalW2OrWcNs8pNSoIzLtjpA","crv":"P-256","kid":"intu-e2e-test","alg":"ES256","use":"sig"} as const;
export const E2E_PRIVATE_JWK = {"kty":"EC","x":"LrfqOBiqTETHwD-3uz4UZ9YvdPB9DJA_N2F62Ge_Zng","y":"Q9qIg57esVV86b_thSPEUalW2OrWcNs8pNSoIzLtjpA","crv":"P-256","d":"Rdx1LQ4aOPA9A-dWj5jIHZ2rXrbGD2EE0w11IqrZlCE","kid":"intu-e2e-test","alg":"ES256"} as const;
export const E2E_QR_SIGNING_KEY = "9:PSz0qOK7wo3-liM8uySunTBmy33C2gNDIL4mFGWLKZc";
