# STEP 10 change-ledger

Status: manual QA passed; awaiting commit/deploy decision.

## Goal

Implement minimal real Send V1 for sending canonical USDC from the Circle User-Controlled Wallet on ARC-TESTNET to another EVM address.

## Files touched

- `api/circle/wallet.ts`
- `src/App.tsx`
- `STEP_10_CHANGE_LEDGER.md`

## Official Circle transfer contract used

Backend creates a Circle user-controlled wallet transfer challenge with:

- `POST https://api.circle.com/v1/w3s/user/transactions/transfer`
- Headers:
  - `Authorization: Bearer <CIRCLE_API_KEY>`
  - `X-User-Token: <userToken>`
  - `Content-Type: application/json`
- Body:
  - `idempotencyKey`
  - `destinationAddress`
  - `walletId`
  - `amounts: ["<amount>"]`
  - `tokenId`
  - `feeLevel: "MEDIUM"`
- Response consumed:
  - `data.challengeId`

## Post-send sync root cause

The first Send V1 patch refreshed balances only once immediately after Circle challenge `COMPLETE`. That can run before Circle's balance API/indexer reflects the submitted transfer, leaving Wallet/Home on the old sender balance until manual refresh. The old form also remained visible after submit, which could invite duplicate sends.

## Validation / guardrails

Backend:

- Requires existing `userToken` request pattern.
- Confirms submitted wallet belongs to the current Circle user wallet list.
- Requires wallet to be Arklake's fixed `ARC-TESTNET` + `SCA` wallet.
- Derives canonical Arc Testnet USDC `tokenId` from trusted Circle balance data.
- Does not trust frontend tokenId, token address, symbol, network, or fee level.
- Requires recipient to match `0x` + 40 hex chars.
- Requires amount > 0.
- Requires max 6 decimals.
- Requires amount <= current canonical USDC balance.
- Generates UUID v4 idempotency key server-side.
- Returns only `challengeId` for the frontend.

Frontend:

- Send form is fixed to USDC on Arc Testnet.
- Shows available canonical USDC balance.
- Validates recipient, amount, decimals, balance, and blocks exact self-send.
- Form validation runs before Circle signing/auth readiness, so empty/invalid form fields show field-specific errors before fresh-approval requirements.
- Shows review step before submit.
- Shows clear Arc Testnet warning.
- Uses Circle Web SDK challenge execution; no custom signing.
- After completed approval, enters a submitted/syncing summary instead of re-rendering the active form.
- Polls real Circle balances every 3 seconds for up to 60 seconds, starting after challenge `COMPLETE`.
- Polling baseline is the canonical USDC balance before send; stop condition is canonical USDC balance <= expected post-send balance.
- Transient balance API errors retry until timeout.
- Sync timeout does not mark the transaction failed.
- Old transaction controls stay inactive after submit; `Send another` is an explicit reset action.

## Signing architecture decision for Arklake V1

- Audit conclusion: no Circle-supported Email OTP flow has been verified that re-obtains a valid `encryptionKey` after page reload without Email OTP and without Arklake persisting signing material.
- Arklake V1 will not persist `encryptionKey` in browser storage, Supabase, backend session, or cookies.
- No Supabase migration, `circle_encryption_key` column, or `/api/auth/signing-session` endpoint is part of STEP 10.
- Arklake app/session continuity and Circle signing capability are intentionally separate.
- After F5/reload, Arklake session can remain authenticated and still show Wallet, Receive, and Invoice views.
- Receive, Wallet viewing, Create Invoice, and Invoice management do not require Circle OTP.
- Send/Pay requires Circle signing material only when the user is about to approve an outgoing payment.
- If `circleAuth` is missing at Send/Pay time, Arklake uses inline Circle Email OTP confirmation.
- OTP completion restores signing material only to React memory for the current page session.
- OTP completion keeps the user on the same action/review and never auto-submits a transaction.

## Signing re-auth / draft restore

- Arklake view session and Circle signing session are intentionally separate.
- Arklake session can survive reload/F5 and still show wallet/balance data.
- Circle signing material (`userToken` + `encryptionKey`) remains React-memory-only.
- `encryptionKey` is not persisted to `localStorage`, `sessionStorage`, cookies, Supabase, or backend session.
- If the user reaches Send review with a valid form but missing `circleAuth`, Send does not show a red transaction failure and does not navigate away to the Arklake sign-in page.
- The Send review instead shows an inline wallet-confirmation panel:
  - `Circle approval needed`
  - `For security, confirm your wallet before sending.`
  - the current Arklake session email
  - CTA: `Send code`
- Before re-auth, frontend stores a short-lived `sessionStorage` draft under `arklake_pending_send_draft_v1` with only:
  - `action: "send"`
  - `recipient`
  - `amount`
  - `expiresAt`
- Draft TTL is 10 minutes.
- Draft explicitly excludes `encryptionKey`, `userToken`, `refreshToken`, API keys, session secrets, and credentials.
- Re-auth uses the existing Circle Email OTP mechanics inline in Send and does not sign out/revoke the Arklake session.
- After successful inline re-auth, Arklake keeps the user in Wallet Send Review.
- The review requires the user to click `Send USDC` again.
- No transaction is auto-submitted after re-auth.
- Expired or invalid drafts are removed and ignored.

## Challenge semantics

- Circle Web SDK executes `challengeId` with `sdk.execute(challengeId, callback)`.
- `COMPLETE` means the Circle challenge completed / user approval finished.
- V1 does not treat `COMPLETE` as chain confirmation.
- If callback data includes `txHash` or `transactionId`, frontend displays it.
- If callback does not include them, V1 does not fabricate them.

## Intentionally deferred

- No fake confirmed state.
- No duplicate-send path after submitted state; the previous form is hidden until `Send another` is explicitly clicked.
- No transaction status polling yet.
- No transaction history / Recent activity integration.
- No multi-token send.
- No multi-network send.
- No manual deploy in this step.

## Manual QA results

PASS:

- Send validation PASS.
- Receive regression PASS.
- OTP re-auth -> real Send -> balance update PASS.
- After OTP/Send -> F5 keeps Arklake session PASS.
- After F5 -> Send missing `circleAuth` shows `Circle approval needed` inline and does not logout PASS.
- Back keeps recipient/amount for the current Send attempt PASS.
- Close clears the Send attempt PASS.
- Opening Send again shows a clean blank form PASS.
- Receive <-> Send switching PASS.

Still not in scope / not completed in STEP 10:

- Chain-confirmed transaction status polling.
- Transaction history / Recent activity integration.
- Multi-token or multi-network send.

## Test results

- `npm.cmd run build` passed with existing dependency/chunk warnings.
- `git diff --check` passed with line-ending warnings only.

## Commit / push status

Not staged, committed, pushed, or deployed.
