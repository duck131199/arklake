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
| Status | **V2 PLAINTEXT MEMO RUNTIME PASS — DEPLOYED ARC TESTNET PROTOTYPE, PRODUCTION-WIRED** |
| Contract address | [`0x7Ef8D661e800ec959daAaE67A8bD4fAaAe3A43D7`](https://testnet.arcscan.app/address/0x7Ef8D661e800ec959daAaE67A8bD4fAaAe3A43D7) |
| Deployer | Project owner [`0xB1f9eE64333564050964241688899166307d446e`](https://testnet.arcscan.app/address/0xB1f9eE64333564050964241688899166307d446e) |
| Deployment transaction | [`0xbf6ca07a97a1de542bec8787fd5baa43ecbcfe77c506249f0cba35321a1ae377`](https://testnet.arcscan.app/tx/0xbf6ca07a97a1de542bec8787fd5baa43ecbcfe77c506249f0cba35321a1ae377) |
| Source | [`prototype/onchain-invoice-reference/contracts/ArklakeInvoicePaymentPrototype.sol`](../prototype/onchain-invoice-reference/contracts/ArklakeInvoicePaymentPrototype.sol) |
| ABI/source verification | **Verified (exact match)** on Arcscan/Blockscout. Solidity `0.8.24+commit.e11b9ed9`, optimizer disabled, 200 configured runs, EVM Cancun, IPFS metadata hash. Runtime bytecode also matches the local build artifact exactly. |
| Notes | Deployment receipt succeeded on Arc Testnet chain ID `5042002`. Runtime proved one Circle UCW confirmation can execute atomic exact-amount approval and payment, emit plaintext Memo, leave zero retained USDC, and leave zero allowance. Pay with Arklake, Connect Wallet, and Scan to Pay now use this contract with invoice-bound data and the strict production verifier. The contract remains explicitly testnet and prototype-grade. |

### Historical Prototype V1

Prototype V1 remains recorded as R&D evidence at [`0xCACDD50644528dFBA131777B528F0F5e82cf69C0`](https://testnet.arcscan.app/address/0xCACDD50644528dFBA131777B528F0F5e82cf69C0), deployed in transaction [`0xfb49776342a5e1aa4b9cf089a996e7a95e215b48119252102572e0a4c5539c98`](https://testnet.arcscan.app/tx/0xfb49776342a5e1aa4b9cf089a996e7a95e215b48119252102572e0a4c5539c98). Its `descriptionCommitment` design, the separate `publicMemo` exploration, and the attempted Arc Memo call through Circle UCW are superseded R&D paths. They are not the current product direction and are retained only as historical evidence.

## 4. Payment reference / invoice proof workstream

Invoice Description V1 remains off-chain business context and the full value is stored with the invoice for UI, email, and PDF surfaces. When its UTF-8 representation is at most 64 bytes, the exact value is also used as the plaintext payment Memo; longer values are rejected before an on-chain invoice payment and are never truncated.

On-chain payment reference is a separate workstream. Prototype V2 proves:

- `paymentReference`: a public UTF-8 reference of 1–32 bytes;
- `memo`: plaintext UTF-8 Memo, limited to 64 bytes without truncation;
- `InvoicePayment`: an event containing the deterministic reference hash, payer, recipient, token, amount, public reference, and plaintext Memo.

The V2 contract is deployed and runtime-validated on Arc Testnet and is wired into all three invoice payment rails in the live Arklake product. `paymentReference` comes from the exact server-authoritative Arklake invoice number and `memo` comes from that invoice's Description. The production verifier requires the matching V2 event and canonical USDC transfer before Paid.

## 5. Existing on-chain payment behavior

Pay with Arklake uses a Circle User-Controlled Wallet smart contract account on Arc Testnet. Circle submits the wallet operation through ERC-4337, so Arcscan may show an outer `handleOps(...)` transaction while the receipt contains the V2 contract call, canonical USDC transfer, and `InvoicePayment` event.

Pay with Arklake uses an atomic exact-amount USDC approval and V2 payment. Connect Wallet and WalletConnect-based Scan to Pay use the same server-authoritative V2 calldata, preferring a supported atomic wallet batch and otherwise using sequential exact approval followed by payment. None of the three invoice rails silently falls back to a direct USDC transfer.

Arklake correlates the payment through its Payment Intent and exact transaction hash, then runs strict server-side verification. The verifier requires the expected chain, successful receipt and confirmations, canonical USDC, exact payer, recipient and amount, the event from the exact V2 contract, exact invoice reference and plaintext Memo, a valid invoice payment window, intent correlation, and transaction uniqueness before the atomic Paid transition. Wallet or Circle submission alone is not Paid.

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
| Production Scan to Pay verification | **PRODUCTION PASS** | [`0x129caf8dff19f5502a6753e0549d696e2345f952c98fcd62a6fea43a6e173c81`](https://testnet.arcscan.app/tx/0x129caf8dff19f5502a6753e0549d696e2345f952c98fcd62a6fea43a6e173c81) | Production invoice `ARK-20260913-BD68354E` paid 5 USDC through V2. Strict verification matched the payer, recipient, canonical USDC, amount, reference, and plaintext Memo `Cascade` before Paid. |

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
- Prototype V2 was deployed at `0x7Ef8D661e800ec959daAaE67A8bD4fAaAe3A43D7`. Circle UCW atomic exact approval plus payment passed runtime audit in transaction `0x50bf570b270f5d81dcfc18c19877f5181adbe19fa114c4ddb8e9cdc290db8615`; Arcscan directly decodes `ARK-PROTOTYPE-V2-001` and plaintext Memo `Thanks Miley`.
- Pay with Arklake, Connect Wallet, and Scan to Pay were subsequently wired to the V2 contract and strict verifier. Production Connect Wallet and Scan to Pay runtime evidence passed; the recorded Scan proof is `0x129caf8dff19f5502a6753e0549d696e2345f952c98fcd62a6fea43a6e173c81`.

## 9. Guardrails

- Production wiring of this testnet prototype does not make it an audited mainnet production contract.
- A successful testnet deployment alone does not mean a contract is production-wired; wiring status requires separate application and runtime evidence.
- Current invoice payments use the V2 contract. Regular non-invoice wallet Send remains a direct canonical USDC transfer.
- **Submitted does not mean Paid.** Only strict verification may complete the Paid transition.
- Do not add a contract address, deployer, deployment transaction, or proof transaction here until the corresponding runtime evidence has been verified.
- Do not present infrastructure contracts such as canonical USDC, Circle wallet contracts, or ERC-4337 entry points as Arklake-owned contracts.
