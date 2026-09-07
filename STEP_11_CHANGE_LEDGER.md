# STEP 11 change-ledger

Status: implementation complete; automated checks passed; awaiting final manual swap QA and commit decision.

## Goal

Implement minimal real Swap V1 on Arc Testnet with Circle Swap Kit and the existing Circle User-Controlled SCA wallet.

## Files touched

- `api/circle/swap.ts`
- `src/SwapFlow.tsx`
- `src/App.tsx`
- `package.json`
- `package-lock.json`
- `tests/swap-api.test.mjs`
- `STEP_11_CHANGE_LEDGER.md`

## Dependencies

- `@circle-fin/swap-kit` 1.6.1
- `@circle-fin/adapter-circle-wallets` 1.7.2
- `@circle-fin/adapter-viem-v2` 1.17.1
- `viem` 2.56.3

## Scope implemented

- Swap is available from the existing app Swap route.
- Uses the existing Arc Testnet SCA wallet and existing Arklake/Circle session behavior.
- Supports selecting any different pair among `USDC`, `EURC`, and `cirBTC`.
- Asset symbols are passed to Swap Kit for resolution; no cirBTC contract address or token type is hard-coded.
- Requests a live quote before review.
- A missing route or insufficient liquidity is shown truthfully as: `Quote unavailable for this amount. Try a smaller amount.`
- Quote review shows prominent Pay and Receive amounts plus secondary Rate, Minimum, and Estimated fee details.
- Fee components using the same token are summed and rounded for display; mixed-token totals remain separated by token.
- Quotes automatically refresh after their local 60-second expiry.
- The only primary CTA changes from `Review swap` to `Swap` after a quote is available.
- No manual balance refresh control is exposed; balances refresh after confirmed execution.

## Quote and execution contract

Quote:

- Calls `SwapKit.estimate` on `Arc_Testnet` with the selected pair and human-readable input amount.
- Uses `allowanceStrategy: "approve"` and `slippageBps: 50`.
- Does not require Circle signing auth or open Circle OTP.
- Returns estimated output, stop limit, fee components, expiry, and a server-signed quote token.
- The signed token binds wallet id, wallet address, pair, amount, minimum output, and expiry.

Execute:

- Circle re-auth is requested only after the user clicks `Swap` and signing auth is missing.
- Re-auth uses the existing inline Circle Email OTP panel, titled `Wallet approval needed` for Swap.
- The user must click `Swap` again after re-auth; execution is never automatic.
- Backend confirms the wallet belongs to the Circle user and is an `ARC-TESTNET` SCA wallet.
- Uses Circle's user-controlled wallet adapter and the reviewed stop limit.
- Swap Kit may create the required allowance approval according to its existing approval strategy.
- Server streams challenge, progress, submission, and result events to the frontend.

## Confirmation and recovery semantics

- Circle challenge `COMPLETE` is treated as approval completion only.
- A swap is confirmed only when Arc returns a successful mined receipt and Swap Kit reports `DONE`.
- A reverted receipt or Swap Kit `FAILED` result is treated as failed.
- Submitted but unconfirmed results remain pending and do not permit an automatic retry.
- Pending swap state is retained in `sessionStorage`; it contains only a transaction hash when one is known.
- Unknown interrupted outcomes require the user to inspect wallet activity before clearing the guard.
- After confirmation, balances are polled until input decreases and output increases or indexing times out.
- After confirmation, Amount and quote state are cleared while the selected pair and success/transaction result remain visible.

## Validation and security boundaries

- Frontend validates different assets, positive decimal amount, and displayed available balance before requesting a quote.
- Backend validates method, action, asset allowlist, amount, wallet identity, address format, quote signature, quote expiry, and transaction hash.
- Quote tokens use an HMAC derived from the server-side Circle API key.
- Upstream error objects are not returned to the browser because they may contain authorization headers.
- No API key, Circle signing token, encryption key, or refresh token is persisted in the Swap draft.
- Swap does not create or provision another wallet.
- Send, Receive, Invoice, Gateway, and authentication architecture are outside this change.

## Live Arc Testnet observation

- USDC to EURC quoted successfully at 9.9 and 9.999 USDC during investigation.
- The live provider returned `INPUT_UNSUPPORTED_ROUTE` / `No route available` at 9.9999, 10, 10.001, and 11 USDC at that time.
- This was a live route/liquidity boundary, not the wallet's USDC balance or Circle signing state.

## Automated coverage

`tests/swap-api.test.mjs` verifies:

- All six directed pairs request live estimates without signing auth.
- Unavailable quotes do not execute and do not expose upstream secrets.
- Tampered, expired, and different-wallet quote tokens are rejected before execution.
- Challenge `COMPLETE` plus service `DONE` without an on-chain receipt is not confirmation.
- Confirmation requires both a successful Arc receipt and completed Swap Kit status.
- Failed receipts and incomplete service status are not reported as confirmed.

## Final check commands

- `npm.cmd run build`
- `node --experimental-vm-modules --test tests/swap-api.test.mjs`
- `git diff --check`

## Commit / push status

Not staged, committed, pushed, or deployed.
