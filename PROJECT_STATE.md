# Arklake project state

Last updated: 2026-09-08

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

Status: **INVOICE CORE V1 CHECKPOINTED — PUBLIC INVOICE V1 PASS LOCALLY, NOT COMMITTED, PUSHED, OR DEPLOYED**

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
- Public fields are limited to invoice identity, masked seller/payer context, amount/asset, memo, status, and timestamps; internal account/session and wallet snapshot fields are not exposed.
- Active invoices show Pay with Arklake, Connect wallet, and Scan to pay as UI entry states only. They do not execute payment, connect wallets, generate a payment QR, verify payment, or mark Paid.
- Expired and Paid public states do not show payment entry options.
- Manual localhost review passed for guest Active access, all three payment entry selectors, and the Expired state without payment options.
- Invoice email, payment execution, verification, receipt, Gateway, and invoice webhook work have not started.

### Product constraint for future Public Invoice / Payment

- A payer must not be required to have an Arklake account to open or pay an invoice.
- A future public invoice must be accessible to guests without sign-in.
- It must support three payment paths: Pay with Arklake, Connect wallet, and Scan to pay / QR.
- All three paths must converge on the same immutable invoice target: receiving wallet snapshot, asset, amount, and invoice ID.
- Every path must pass payment verification before the invoice can become Paid.
- Invoice Core schema and APIs must remain payer-account-optional and must not introduce an Arklake payer account foreign-key requirement.
- Public Invoice V1 now exposes the three entry states; their payment paths remain unimplemented.

## Related ledgers

- `EMAIL_SYSTEM_CHANGE_LEDGER.md`: approved Email System V1 design and implementation mapping.
- `STEP_11_CHANGE_LEDGER.md`: committed Swap V1 implementation.
- `STEP_10_CHANGE_LEDGER.md`: Circle wallet authentication, signing, Send, and Receive history.
