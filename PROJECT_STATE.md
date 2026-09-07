# Arklake project state

Last updated: 2026-09-07

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

Status: **INVESTIGATED — IMPLEMENTATION NOT STARTED**

- Invoice Core V1 investigation is complete.
- Current invoice creation, list, filters, and detail use browser `localStorage` only.
- Current asset is hard-coded to USDC and invoice IDs are browser-generated UUIDs.
- No invoice Supabase schema, authenticated API, or server-side persistence has been implemented.
- No invoice may be marked Paid until a future payment-verification flow proves payment.
- Invoice email, public invoice page, payment, receipt, Gateway, and invoice webhook work have not started.

## Related ledgers

- `EMAIL_SYSTEM_CHANGE_LEDGER.md`: approved Email System V1 design and implementation mapping.
- `STEP_11_CHANGE_LEDGER.md`: committed Swap V1 implementation.
- `STEP_10_CHANGE_LEDGER.md`: Circle wallet authentication, signing, Send, and Receive history.
