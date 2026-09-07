# Arklake Email System change ledger

Status: Email System V1 visual approved; SMTP, sender domain, and production delivery remain unconfigured.

## Visual foundation

- Light canvas with a compact centered Arklake mark and wordmark.
- White content card with a subtle border, rounded corners, Ink typography, and restrained Aqua accents.
- Product meaning appears before transaction proof.
- Email-client-safe table layout and inline styles.
- No long support box or disclaimer is added to these four V1 emails.

## Visual PASS

1. **Circle OTP / Verification**
   - Security-focused.
   - Subject: `Your Arklake verification code`
   - Headline: `Verify your email`
   - Keeps the required `{{ email.otp }}` placeholder.
   - Source: `email-templates/circle-email-otp.html`

2. **Receive**
   - Transaction-focused and compact.
   - Subject/headline: `You received [amount] [asset]`
   - Runtime implementation: `api/circle/activity-email.ts`
   - Approved fixture: `public/email-preview/transaction-receive.html`

3. **Send**
   - Transaction-focused and compact.
   - Subject: `[amount] [asset] sent successfully`
   - Headline: `[asset] sent successfully`
   - Runtime implementation: `api/circle/activity-email.ts`
   - Approved fixture: `public/email-preview/transaction-send.html`

4. **Swap**
   - Transaction-focused and compact.
   - Subject/headline: `Swap successful`
   - Hero: `[amount out] [asset] → [amount in] [asset]`
   - Runtime implementation: `api/circle/activity-email.ts`
   - Approved fixture: `public/email-preview/transaction-swap.html`

## Deferred

- Circle SMTP provider and sender configuration.
- Resend sender domain and production credentials.
- Invoice and payment email templates, including their contextual support and safety content.
