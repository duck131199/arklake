# STEP 9 change-ledger

Status: awaiting Duck localhost review.

- Scope: Receive only.
- Files changed: `src/App.tsx`
- Change: Home and Wallet Receive cards now open the shared `ReceiveFlow` component.
- ReceiveFlow shows real current Circle wallet address when available, copies that address, and renders a QR code from that same address.
- Empty state: no address or QR is shown when the current session has no wallet address.
- Network warning: Arc Testnet only.
- Not staged, committed, pushed, or deployed.

## STEP 9 Arc USDC mirror display fix

Status: awaiting Duck localhost review.

- Scope: user-facing Wallet balance/display only.
- Files changed: `src/App.tsx`.
- Added Arc Testnet canonical USDC identity constant: `0x3600000000000000000000000000000000000000`.
- Preserved Circle token metadata fields `standard` and `isNative` during frontend normalization.
- Added identity-specific helpers:
  - `isArcTestnetUsdc`
  - `isCanonicalArcTestnetUsdc`
  - `isNativeArcTestnetUsdcMirror`
  - `getUserFacingBalances`
- Changed `getUsdcBalance` to prefer canonical Arc Testnet USDC, then fallback to native Arc Testnet USDC mirror, then existing generic USDC fallback.
- Changed Wallet asset count/list to use `getUserFacingBalances(balances)` so native Arc USDC mirror is hidden only when canonical Arc USDC exists.
- Does not merge/filter unrelated tokens with the same symbol.
- Does not add native + canonical amounts together.
- Not staged, committed, pushed, or deployed.
- Verification: `npm.cmd run build` passed. PowerShell `npm run build` was blocked by local script execution policy, so `.cmd` was used.
