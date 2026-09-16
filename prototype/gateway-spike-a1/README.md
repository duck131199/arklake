# Gateway spike A1

## Current checkpoint: A4.2b one-shot manual Kit spend

Run `node prototype/gateway-spike-a1/server.mjs` from the repo root and open `http://localhost:3001`. Restart the server after this patch. Authenticate with the same Circle user, click **Inspect Arc + Polygon Amoy wallets**, then **Run fresh A4.2b preflight**. Review the exact route, current balance and fees before manually clicking **Spend 1 USDC to Arc** and approving each Circle challenge.

A4.2b re-runs the complete preflight immediately before calling `kit.unifiedBalance.spend()` once. The server locks the operation before any spend work, relays each Circle challenge to the browser, and never retries `spend()` at application level. Circle provider transport defaults remain intact. Terminal `COMPLETED`, `FAILED`, and `UNKNOWN` states stay locked. Returned Kit data is allowlisted; signatures and credentials are never exposed. Completion requires a successful destination receipt plus matching Arc balance movement, and the runner reports live Gateway/Arc deltas.

Tests: `node --test prototype/gateway-spike-a1/*.test.mjs` (all Circle/Kit operations mocked).

Experimental localhost-only harness for proving this boundary:

`Circle UCW SCA → Gateway BurnIntent → SIGN_TYPEDDATA → signature → adapter contractSigner classification`

It deliberately stops before `POST /v1/transfer`. It does not deposit funds, mint, forward, add a delegate, or create a Gateway on-chain transaction.

Run from the repository root:

```powershell
node prototype/gateway-spike-a1/server.mjs
```

Open `http://localhost:3001`, authenticate with the owner of an existing Arc Testnet Circle SCA, and create the signing challenge. The user must approve it in the Circle dialog.

The test BurnIntent uses the authenticated SCA as `sourceDepositor`, `sourceSigner`, and `destinationRecipient`. It is an Arc Testnet-to-Arc Testnet signing fixture for the A1 capability check and is never submitted to Gateway.

After authentication, the A2 preflight can list wallets using the in-memory user token. It first requires the authenticated user to own Arc SCA `0xd94074edb1da4c98959d455172beb58e4400324f`; only then does it report any `MATIC-AMOY` wallet and read its bytecode, native balance, and canonical USDC balance. It never creates a wallet or submits a transaction.

A2.1 adds one explicit user-triggered provisioning action when discovery proves the expected Arc SCA is present and `MATIC-AMOY` is absent. It requests the official Circle User-Controlled Wallet creation challenge for `blockchains: ['MATIC-AMOY']` and `accountType: 'SCA'`; the user must approve it with the Web SDK. It then repeats only the read-only discovery. The hard stop remains before faucets, funding, approvals, Gateway deposits, delegates, or `/v1/transfer`.

A2.3 adds a localhost-only, fixed 2 USDC Polygon Amoy deposit test. After rechecking the exact authenticated Arc and Polygon wallets, the user may manually create and approve two separate Circle UCW `contractExecution` challenges: canonical USDC `approve(GatewayWallet, 2000000)`, followed only after verified on-chain allowance by `GatewayWallet.deposit(USDC, 2000000)`. The runner recovers each challenge to its Circle transaction and Polygon receipt, then reads USDC, POL, allowance, SCA bytecode, and Gateway API balance. Gas Station sponsorship is automatic under the project's active Polygon Amoy policy; no policy identifier or native POL is supplied by the runner.

The A1 and A2 flows stop before `/v1/transfer`, BurnIntent submission, delegates, Gateway minting, or any production integration. Credentials remain in browser memory and are never written to storage.

A3.1 prepares a fixed 1 USDC transfer from the exact Polygon Amoy Gateway depositor to the exact Arc Testnet SCA. It first requires at least 1 USDC of live Gateway available balance, asks the public Gateway `/v1/estimate` endpoint to supply the fee and expiration fields, and then uses `gateway.v1.signBurnIntents` with the Polygon Circle UCW SCA. The user approves the `SIGN_TYPEDDATA` challenge. The UI shows a sanitized `/v1/transfer` request body with the signature redacted and permanently stops before submission. It does not deposit, burn, mint, delegate, or move funds.

A3.2 adds a separate, explicit one-shot action that is enabled only after A3.1 signing succeeds in the same browser/server session. It submits the exact stored BurnIntent and signature to `POST /v1/transfer`, shows an allowlisted response, and polls the official transfer status endpoint. The signed A3.1 request does not enable forwarding, so acceptance can return an attestation without submitting `gatewayMint` on Arc; the runner reports Arc USDC balance separately and does not mint, retry, delegate, or fall back automatically.

A3.3a adds an isolated Circle UCW wallet check. After exact Arc and Polygon SCA correlation, it lists a distinct `MATIC-AMOY` wallet with `accountType: 'EOA'`. If absent, the user may explicitly request the official create-wallet challenge for `blockchains: ['MATIC-AMOY']` and `accountType: 'EOA'`, approve it in the Web SDK, and read the wallet list again. The runner requires `eth_getCode` to return `0x` and stops before `addDelegate`, typed-data signing, Gateway estimate, deposit, or transfer.
