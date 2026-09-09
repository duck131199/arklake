# Arklake project state

Last updated: 2026-09-09

This file is the living source of truth for restoring the current Arklake project state across sessions. Read it before continuing implementation or infrastructure work.

## Production

Status: **LIVE**

- Last production checkpoint: `c6b498afa357b57c892e14751ae75151191de6b2` (`Fix Swap production dependency loading`).
- This checkpoint contains the Swap production dependency hotfix.
- `https://arklake.vercel.app` is the current working production deployment.
- The local work described below is not part of this production checkpoint.

## Local work

Status: **PASS LOCALLY — NOT COMMITTED, PUSHED, OR DEPLOYED**

### Recent Activity V1

- Loads real Circle transaction history for the current account wallet.
- Normalizes real money movement as Receive, Send, or Swap.
- Persists wallet activities and money legs in Supabase.
- Includes Wallet timeline and Transaction Detail UI.
- Includes safe activity and leg deduplication plus repeated-sync idempotency.
- Historical Arklake swaps are reconstructed with one outgoing and one incoming leg.
- Wallet Recent Activity UI has passed manual visual review.

### Transaction Email foundation

- Uses a Supabase notification outbox and stable Resend idempotency keys.
- Implements confirmed Receive, Send, and Swap runtime notifications.
- Email delivery failure does not fail activity sync and remains retryable.
- Existing confirmed historical activities are seeded as `suppressed` so enabling the feature does not send old notifications.
- Production Gmail delivery has not been tested.

### Arklake Email System V1

- Circle OTP / Verification, Receive, Send, and Swap are the four approved V1 email designs.
- All four have passed visual review.
- All four use the same Arklake light Ink/Aqua visual foundation and the same Arklake logo reference.
- OTP remains security-focused; transaction messages remain compact and transaction-focused.
- Production SMTP provider, sender domain, and credentials are not configured.
- Transaction Email is guarded by `ARKLAKE_TRANSACTION_EMAIL_ENABLED`; it is off unless the server value is exactly `true`.

## Pending infrastructure

Status: **WAITING ON DOMAIN REGISTRATION**

- `arklake.site` was purchased through Miss Hosting and is currently `Pending Registration`.
- The root domain and `www` have been added to Vercel.
- DNS records have been entered.
- Resume only after the domain becomes Active, in this order:
  1. Finish Vercel domain verification.
  2. Add and verify the Arklake sending domain in Resend.
  3. Configure Resend production credentials for Transaction Email.
  4. Replace Mailtrap Sandbox with Resend SMTP in Circle User-Controlled Wallets Email configuration.
  5. Run real Gmail tests for Circle OTP and transaction notifications.

## Invoice

Status: **INVOICE CORE + PUBLIC INVOICE V1 CHECKPOINTED — PAYMENT ENTRY + DOWNLOAD INVOICE V1 LOCAL; NOT LOCAL PASS; NOT COMMITTED, PUSHED, OR DEPLOYED**

- Supabase is the source of truth; Invoice no longer uses browser `localStorage`.
- Authenticated account-scoped API supports Create, List, and Detail.
- Creation snapshots the receiving Circle wallet ID and address and stores payer email, USDC amount, memo, and server-calculated expiry.
- Internal UUID, human-readable invoice number, and timestamps are generated server-side.
- Lifecycle is `active | paid | expired`; expired status is applied server-side when invoices are read.
- List, status filters, detail, loading/error/retry, and F5 persistence use real Supabase data.
- Local runtime verification created a real Active invoice, retained it after F5, then verified server-side transition to Expired.
- No invoice may be marked Paid until a future payment-verification flow proves payment.
- Invoice Core V1 was committed and pushed as `cb54cbe90d634f4d290044d723432b603cbde84b` (`Add Invoice Core V1`).
- Public Invoice V1 adds guest-readable `/invoice/:id` pages backed by a public read-only API and real Supabase invoice data.
- Seller Invoice Detail can copy the public link.
- Public invoice fields are limited to invoice identity, masked seller/payer context, amount/asset, memo, status, and timestamps. The active payment-target endpoint additionally exposes only invoice ID/number, amount/asset, and the immutable receiving address needed to submit a guest payment; it never exposes internal account/session data or Circle wallet ID.
- Active invoices show Pay with Arklake, Connect wallet, and Scan to pay. Pay with Arklake and Connect wallet can submit a transfer; Scan prepares a fixed EIP-681 Arc Testnet USDC request from the immutable invoice target. No path verifies payment or marks Paid.
- Expired and Paid public states do not show payment entry options.
- Manual localhost review passed for guest Active access, all three payment entry selectors, and the Expired state without payment options.
- Public Invoice logo navigation keeps guest users on `/` and returns an authenticated session to `/app` without changing auth/session state.
- Session entry routing now waits for restore: authenticated visits to `/` or `/auth/sign-in` return to `/app` without initializing Circle sign-in again, while anonymous and signed-out users still see Landing or Sign in.
- Public Invoice V1 was committed and pushed as `fd4876ffec4640204654d422447e89125569761e` (`Add Public Invoice V1`).
- Pay with Arklake V1 reuses the existing Arklake session, Circle Email OTP login, wallet balance data, transfer preparation endpoint, Circle challenge, and signing re-auth panel.
- An anonymous payer returns to the same public invoice after OTP and stops at Review payment; payment is never auto-submitted after authentication.
- New-payer provisioning accepts a successful Circle `INITIALIZE` SDK callback without requiring its immediate status to be `COMPLETE`, then retries wallet lookup while Circle indexes the new Arc Testnet SCA wallet. SDK callback errors still fail onboarding.
- Review validates the current payer wallet, canonical Arc Testnet USDC balance, invoice amount, and the immutable receiving-wallet snapshot. Insufficient balance and self-payment are blocked truthfully.
- Circle challenge completion remains Submitted. Pay with Arklake now takes a valid SDK transaction hash, or resolves a delayed hash from the Circle transaction `refId` bound to the invoice, then automatically runs strict Payment Verification with bounded confirmation polling.
- Pay with Arklake V1 is CODE PASS, including the provisioning fix, but remains pending end-to-end runtime re-test after Circle OTP delivery was restored through the temporary Gmail SMTP configuration. It is not RUNTIME PASS or LOCAL PASS.
- Connect wallet V1 uses the existing `viem` dependency and the injected EIP-1193 browser provider, with no new wallet framework. It connects a guest wallet, enforces Arc Testnet, can request a network switch/add, reads canonical Arc Testnet USDC, and renders immutable payment review before submission.
- External-wallet submission rechecks chain, selected account, and USDC balance immediately before sending canonical USDC to the invoice receiving snapshot. Its provider transaction hash is bound to the open invoice and automatically passed to strict Payment Verification with bounded confirmation polling.
- Connect wallet V1 is CODE PASS and real on-chain RUNTIME PASS.
- Connect wallet files are `src/external-wallet.ts`, `src/App.tsx`, `api/invoice-payment-target.ts`, `tests/external-wallet.test.mjs`, `tests/invoice-payment.test.mjs`, and this ledger. Mock-provider tests cover connect-without-submit, Arc chain switching, canonical USDC balance/calldata, exact amount/recipient, and wrong-chain submission blocking.
- Download Invoice V1 adds server-generated branded PDF invoices to Public Invoice and authenticated Seller Invoice Detail. Public downloads require no Arklake session and use masked seller/payer context; seller downloads validate the session and query by the current `account_id` before using full invoice parties.
- The PDF contains Arklake branding, invoice number, current Active/Expired status, seller, payer, amount/asset, memo, created time, expiry time, and total. It explicitly identifies itself as an invoice document rather than a payment receipt and introduces no Paid transition.
- Download Invoice files are `api/invoice-pdf.ts`, `server/invoice-pdf-core.ts`, `server/arklake-logo.js`, `src/App.tsx`, `tests/invoice-pdf.test.mjs`, `package.json`, `package-lock.json`, and this ledger. Active and Expired PDFs were generated from real localhost invoice data and visually rendered successfully.
- Download Invoice visual polish embeds the real `public/brand/arklake-mark-trimmed.png` asset into the PDF bundle, uses a compact two-column parties/dates layout, gives Total Due primary emphasis, and removes developer-facing receipt/generation copy. Download links pass the browser IANA timezone so PDF dates match the Public/Seller Invoice UI without changing stored timestamps.
- Download Invoice V1 is CODE PASS; Active and Expired PDFs have passed manual visual review and are VISUAL PASS.
- Scan to pay V1 is CODE PASS and happy-path RUNTIME PASS. OKX Mobile parsed the static Arklake QR with the exact amount, recipient, and Arc Testnet, the payer signed and sent the real transaction, it confirmed on-chain, and the Arklake wallet received the funds.
- Scan to pay V2 is implemented locally with invoice-scoped payment intents and a wallet-agnostic WalletConnect/Reown session. The Payment Intent migration has been applied to Supabase. Every public payment rail binds its returned transaction hash to an invoice intent, and strict Payment Verification rejects missing or mismatched intent credentials before it can mark the invoice Paid.
- Scan to pay V2 is CODE PASS and RUNTIME PASS. A real WalletConnect mobile payment was correlated to the correct intent and marked only its invoice Paid; a second Active invoice with the same recipient and amount remained Active.
- Payment Verification V1 is CODE PASS and RUNTIME PASS. It checks Arc Testnet chain/receipt confirmations, canonical USDC logs, the immutable recipient, exact six-decimal amount, and the invoice active window before a service-role-only atomic RPC can mark Paid. Transaction reuse is DB-unique and activity linkage is optional.
- Invoice Completion Patch A is implemented locally and its migration is applied to Supabase: scheduled `pg_cron` expiry persists only due Active invoices, lazy expiry remains as fallback, and a transaction mined within the invoice window may finish strict verification after wall-clock expiry.
- Invoice Completion Patch B is implemented locally: Seller and Public Paid Invoice detail render the verified `paid_at`, and Invoice PDF V1.1 carries the same Paid at value while retaining invoice semantics and the Arklake visual system. Runtime visual review is pending; this checkpoint is not committed, pushed, or deployed.
- Pay with Arklake and Connect wallet auto-confirm are implemented locally and CODE PASS: Submitted remains distinct from Paid, pending confirmations are polled with a finite limit, strict verification alone transitions the invoice, and failed/timed-out confirmation leaves recovery available. Runtime review of both auto-confirm paths is pending.
- Pay with Arklake P0 is CODE and RUNTIME PASS. Its applied migration enforces one unresolved Arklake attempt per invoice, persists Circle challenge/transaction identifiers before and after approval, and keeps submitted payments blocked across F5/reopen. Recovery uses the authenticated Arklake backend session to resolve the exact Circle transaction hash without client signing credentials, then binds the intent and runs strict Payment Verification. Submitted remains distinct from Paid; only a Circle terminal failure permits a new attempt.
- Invoice email, receipt, Gateway, and invoice webhook work have not started.

### Product constraint for future Public Invoice / Payment

- A payer must not be required to have an Arklake account to open or pay an invoice.
- A future public invoice must be accessible to guests without sign-in.
- It must support three payment paths: Pay with Arklake, Connect wallet, and Scan to pay / QR.
- All three paths must converge on the same immutable invoice target: receiving wallet snapshot, asset, amount, and invoice ID.
- Every path must pass payment verification before the invoice can become Paid.
- Invoice Core schema and APIs must remain payer-account-optional and must not introduce an Arklake payer account foreign-key requirement.
- All three payment paths submit immutable transfers and automatically invoke strict Payment Verification. Scan to pay V2 uses an invoice-bound WalletConnect/Reown session; manual transaction-hash verification is no longer part of its happy path.

## Related ledgers

- `EMAIL_SYSTEM_CHANGE_LEDGER.md`: approved Email System V1 design and implementation mapping.
- `STEP_11_CHANGE_LEDGER.md`: committed Swap V1 implementation.
- `STEP_10_CHANGE_LEDGER.md`: Circle wallet authentication, signing, Send, and Receive history.
