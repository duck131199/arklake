# App-owned proof for Arklake

## 1. Purpose

This document is the source of truth for reviewers and developers verifying Arklake's app-owned footprint on Arc. It is an engineering and provenance record, not a primary user-facing feature.

Infrastructure contracts used by Arklake, including canonical USDC and Circle wallet infrastructure, are not Arklake-owned contracts. A contract belongs in the app-owned inventory only when Arklake owns its source and has explicitly recorded its lifecycle status here.

## 2. Networks

| Network | Chain ID | Canonical USDC | Explorer |
| --- | ---: | --- | --- |
| Arc Testnet | `5042002` | `0x3600000000000000000000000000000000000000` | [testnet.arcscan.app](https://testnet.arcscan.app/) |

No Arklake-owned production contract is recorded on this network yet.

## 3. App-owned contracts

### ArklakeInvoicePaymentPrototype V2

| Field | Value |
| --- | --- |
| Name | `ArklakeInvoicePaymentPrototype` |
| Purpose | Test whether a Circle User-Controlled Wallet SCA can atomically approve canonical USDC, make an exact payment, and emit a public payment reference plus plaintext Memo. |
| Status | **V2 PLAINTEXT MEMO RUNTIME PASS — DEPLOYED ARC TESTNET PROTOTYPE** |
| Contract address | [`0x7Ef8D661e800ec959daAaE67A8bD4fAaAe3A43D7`](https://testnet.arcscan.app/address/0x7Ef8D661e800ec959daAaE67A8bD4fAaAe3A43D7) |
| Deployer | Project owner [`0xB1f9eE64333564050964241688899166307d446e`](https://testnet.arcscan.app/address/0xB1f9eE64333564050964241688899166307d446e) |
| Deployment transaction | [`0xbf6ca07a97a1de542bec8787fd5baa43ecbcfe77c506249f0cba35321a1ae377`](https://testnet.arcscan.app/tx/0xbf6ca07a97a1de542bec8787fd5baa43ecbcfe77c506249f0cba35321a1ae377) |
| Source | [`prototype/onchain-invoice-reference/contracts/ArklakeInvoicePaymentPrototype.sol`](../prototype/onchain-invoice-reference/contracts/ArklakeInvoicePaymentPrototype.sol) |
| ABI/source verification | **Verified (exact match)** on Arcscan/Blockscout. Solidity `0.8.24+commit.e11b9ed9`, optimizer disabled, 200 configured runs, EVM Cancun, IPFS metadata hash. Runtime bytecode also matches the local build artifact exactly. |
| Notes | Deployment receipt succeeded on Arc Testnet chain ID `5042002`. Runtime proved one Circle UCW confirmation can execute atomic exact-amount approval and payment, emit plaintext Memo, leave zero retained USDC, and leave zero allowance. It is not connected to an invoice, a production payment rail, or the production verifier. |

### Historical Prototype V1

Prototype V1 remains recorded as R&D evidence at [`0xCACDD50644528dFBA131777B528F0F5e82cf69C0`](https://testnet.arcscan.app/address/0xCACDD50644528dFBA131777B528F0F5e82cf69C0), deployed in transaction [`0xfb49776342a5e1aa4b9cf089a996e7a95e215b48119252102572e0a4c5539c98`](https://testnet.arcscan.app/tx/0xfb49776342a5e1aa4b9cf089a996e7a95e215b48119252102572e0a4c5539c98). Its `descriptionCommitment` design, the separate `publicMemo` exploration, and the attempted Arc Memo call through Circle UCW are superseded R&D paths. They are not the current product direction and are retained only as historical evidence.

## 4. Payment reference / invoice proof workstream

Invoice Description V1 is off-chain business context. It is stored with the invoice and rendered in the applicable UI, email, and PDF surfaces, but it is not included in current payment calldata or transaction events.

On-chain payment reference is a separate workstream. Prototype V2 proves:

- `paymentReference`: a public UTF-8 reference of 1–32 bytes;
- `memo`: plaintext UTF-8 Memo, limited to 64 bytes without truncation;
- `InvoicePayment`: an event containing the deterministic reference hash, payer, recipient, token, amount, public reference, and plaintext Memo.

The prototype is deployed and runtime-validated on Arc Testnet but has not been wired into production. In a future integration, `paymentReference` must map to the exact existing Arklake Invoice ID and `memo` must come from that invoice's Memo. Production payment and verifier behavior remain unchanged.

## 5. Existing on-chain payment behavior

Pay with Arklake currently uses a Circle User-Controlled Wallet smart contract account on Arc Testnet. Circle submits the wallet operation through ERC-4337, so Arcscan may show an outer `handleOps(...)` transaction while the receipt contains the canonical USDC transfer made by the wallet operation.

The current production payment behavior is a direct canonical USDC transfer to the invoice recipient. It does not add an Arklake invoice reference or Description to calldata, and it does not emit an Arklake-owned payment event.

Arklake correlates the payment through its Payment Intent and exact transaction hash, then runs strict server-side verification. The verifier requires the expected chain, successful receipt and confirmations, canonical USDC, exact recipient and amount, a valid invoice payment window, intent correlation, and transaction uniqueness before the atomic Paid transition. Circle challenge completion or transaction submission alone is not Paid.

Primary implementation paths:

- [`src/App.tsx`](../src/App.tsx) — invoice payment UI and Circle challenge execution;
- [`api/circle/wallet.ts`](../api/circle/wallet.ts) — Circle wallet transfer creation and exact attempt recovery;
- [`api/invoice-payment-intent.ts`](../api/invoice-payment-intent.ts) — Payment Intent creation, submitted transaction binding, and recovery status API;
- [`api/invoice-payment-verify.ts`](../api/invoice-payment-verify.ts) — strict verification entry point;
- [`server/invoice-payment-verify-core.ts`](../server/invoice-payment-verify-core.ts) — Arc receipt and canonical USDC verification rules.

## 6. Proof transactions

Add a transaction only after its runtime evidence has been checked against the expected chain, contract, calldata or event, token transfer, parties, and amount.

| Proof | Status | Transaction | Notes |
| --- | --- | --- | --- |
| V2 prototype deployment | Runtime-audited | [`0xbf6ca07a97a1de542bec8787fd5baa43ecbcfe77c506249f0cba35321a1ae377`](https://testnet.arcscan.app/tx/0xbf6ca07a97a1de542bec8787fd5baa43ecbcfe77c506249f0cba35321a1ae377) | Receipt success; project-owner deployer and `0x7Ef8D661e800ec959daAaE67A8bD4fAaAe3A43D7` created contract match; deployed runtime bytecode matches the reviewed V2 artifact. |
| V1 prototype deployment | Historical R&D | [`0xfb49776342a5e1aa4b9cf089a996e7a95e215b48119252102572e0a4c5539c98`](https://testnet.arcscan.app/tx/0xfb49776342a5e1aa4b9cf089a996e7a95e215b48119252102572e0a4c5539c98) | Preserved deployment evidence for the superseded description-commitment prototype. |
| Sequential exact-amount USDC approval | Runtime-audited | [`0xda413c854aa96cd05852934259777de4ae3251b420aaa64829f65eb4344428e6`](https://testnet.arcscan.app/tx/0xda413c854aa96cd05852934259777de4ae3251b420aaa64829f65eb4344428e6) | Receipt success; canonical USDC `Approval` set payer allowance for the prototype to exactly `10000` base units. |
| Sequential prototype payment | Runtime-audited | [`0x95fd5cf6133ba16c08459f0a6a8e9db3eaf84497d4f0186fdc7094aabc07641c`](https://testnet.arcscan.app/tx/0x95fd5cf6133ba16c08459f0a6a8e9db3eaf84497d4f0186fdc7094aabc07641c) | Receipt success; inner call reached the prototype, transferred exactly `10000` USDC base units from payer to recipient, emitted the exact `InvoicePayment` event, retained zero USDC, and marked the reference used. |
| V2 atomic approve + pay | **V2 PLAINTEXT MEMO RUNTIME PASS** | [`0x50bf570b270f5d81dcfc18c19877f5181adbe19fa114c4ddb8e9cdc290db8615`](https://testnet.arcscan.app/tx/0x50bf570b270f5d81dcfc18c19877f5181adbe19fa114c4ddb8e9cdc290db8615) | One Circle UCW confirmation and one ERC-4337 UserOperation executed exact `approve` then `pay`. `InvoicePayment` contains `ARK-PROTOTYPE-V2-001` and plaintext `Thanks Miley`; retained USDC and final allowance are both zero. |
| Example plaintext Memo reference | Runtime-audited | [`0x50bf570b270f5d81dcfc18c19877f5181adbe19fa114c4ddb8e9cdc290db8615`](https://testnet.arcscan.app/tx/0x50bf570b270f5d81dcfc18c19877f5181adbe19fa114c4ddb8e9cdc290db8615) | Audit in Arcscan via **Transaction → Logs → Address ArklakeInvoicePaymentPrototype → InvoicePayment**. Arcscan directly decodes `paymentReference = ARK-PROTOTYPE-V2-001` and `memo = Thanks Miley`. |
| Production verification | Pending / not yet created | None | Cannot be recorded before a separately reviewed production integration exists. |

## 7. Source-of-truth links

- [Prototype overview and runtime gates](../prototype/onchain-invoice-reference/README.md)
- [Prototype contract](../prototype/onchain-invoice-reference/contracts/ArklakeInvoicePaymentPrototype.sol)
- [Prototype Foundry tests](../prototype/onchain-invoice-reference/test/ArklakeInvoicePaymentPrototype.t.sol)
- [Prototype call encoder](../prototype/onchain-invoice-reference/scripts/encode-prototype-calls.mjs)
- [Prototype receipt auditor](../prototype/onchain-invoice-reference/scripts/audit-prototype-receipt.mjs)
- [Circle wallet API handler](../api/circle/wallet.ts)
- [Payment Intent and binding API](../api/invoice-payment-intent.ts)
- [Strict payment verifier](../api/invoice-payment-verify.ts)
- [Receipt verification core](../server/invoice-payment-verify-core.ts)
- [Current project status](../PROJECT_STATE.md)

Repository: [duck131199/arklake](https://github.com/duck131199/arklake)

## 8. Status history

- Invoice Description / Memo V1 completed code, tests, and local visual review. Description remains off-chain.
- cirBTC Swap classification fix completed code, tests, and local runtime validation.
- On-chain Invoice Reference Prototype 0 completed code review, Solidity 0.8.24 compilation, and Foundry tests.
- On-chain Invoice Reference Prototype 0 was deployed on Arc Testnet by the project-owner wallet. Its deployment receipt, contract address, runtime bytecode, and canonical USDC constant passed post-deploy RPC audit.
- Prototype V1 source and ABI were verified, and its sequential and atomic experiments remain preserved as historical R&D evidence.
- Prototype V2 was deployed at `0x7Ef8D661e800ec959daAaE67A8bD4fAaAe3A43D7`. Circle UCW atomic exact approval plus payment passed runtime audit in transaction `0x50bf570b270f5d81dcfc18c19877f5181adbe19fa114c4ddb8e9cdc290db8615`; Arcscan directly decodes `ARK-PROTOTYPE-V2-001` and plaintext Memo `Thanks Miley`. Production payment and verifier wiring remain pending.

## 9. Guardrails

- A prototype contract is not a production payment contract.
- A successful testnet deployment does not mean the contract is production-wired.
- Direct canonical USDC transfer remains the current production invoice payment behavior.
- **Submitted does not mean Paid.** Only strict verification may complete the Paid transition.
- Do not add a contract address, deployer, deployment transaction, or proof transaction here until the corresponding runtime evidence has been verified.
- Do not present infrastructure contracts such as canonical USDC, Circle wallet contracts, or ERC-4337 entry points as Arklake-owned contracts.
