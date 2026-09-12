# Arklake On-chain Invoice Reference — Prototype 0

> **TESTNET PROTOTYPE ONLY.** This code is unaudited, is not connected to Arklake invoices or production payment verification, and must not be deployed to production.

This spike tests whether an existing Circle User-Controlled SCA can atomically approve canonical Arc Testnet USDC and call a small payment contract while preserving a public payment reference and plaintext Memo in the transaction receipt.

## Data model

- `paymentReference` is a public, 1–32 byte UTF-8 value written to Arc Testnet in the `InvoicePayment` event.
- `memo` is public plaintext UTF-8 data, limited to 64 bytes without truncation, and written directly to the `InvoicePayment` event. The fixed runtime sample is `Thanks Miley`.
- Canonical Arc Testnet USDC is fixed at `0x3600000000000000000000000000000000000000` with 6 decimals.

The contract transfers the exact requested amount directly from payer to recipient with `transferFrom`; it does not route funds through or retain USDC. A successful reference cannot be reused.

## Install/tooling

The JavaScript scripts reuse the repository's existing `viem` dependency. The Solidity test is self-contained and requires Foundry (`forge`) to run; Foundry is not added to the repository dependency graph.

Run Solidity tests when Foundry is available:

```sh
forge test --root prototype/onchain-invoice-reference -vv
```

## Encode calls without submitting

```sh
node prototype/onchain-invoice-reference/scripts/encode-prototype-calls.mjs \
  --prototype=0xPrototypeAddress \
  --recipient=0xRecipientAddress \
  --amount=0.01 \
  --reference=ARK-PROTOTYPE-V2-001 \
  --memo="Thanks Miley"
```

The output contains:

1. sequential USDC `approve(address,uint256)` calldata;
2. sequential prototype `pay(address,uint256,string,string)` calldata;
3. Circle SCA `executeBatch((address,uint256,bytes)[])` calldata containing both calls.

This script does not call Circle or an RPC endpoint.

## Audit a future receipt

After a user-authorized Prototype 0 transaction exists, audit it read-only:

```sh
node prototype/onchain-invoice-reference/scripts/audit-prototype-receipt.mjs \
  --tx=0xTransactionHash \
  --prototype=0xPrototypeAddress \
  --payer=0xCircleScaAddress \
  --recipient=0xRecipientAddress \
  --amount=0.01 \
  --reference=ARK-PROTOTYPE-V2-001 \
  --memo="Thanks Miley"
```

Set `ARC_RPC_URL` only when overriding viem's Arc Testnet default. The audit requires receipt success, an exact canonical USDC `Transfer`, an exact `InvoicePayment` event, and zero retained prototype USDC at the receipt block.

## Runtime gate

V2 runtime validation uses one Circle UCW confirmation for an atomic exact-amount approval followed by payment. Confirm the challenge correlation, transaction hash, one ERC-4337 UserOperation, exact two-call ordering, transfer/event, zero retained USDC, zero final allowance, and Arcscan plaintext Memo decoding.

Circle challenge completion and transaction submission are not payment confirmation. **Submitted != Paid.** A future production verifier must continue checking receipt success, confirmations, canonical token, exact recipient and amount, invoice window, reference, Memo, and transaction uniqueness before marking an invoice Paid.

Earlier `descriptionCommitment`, `publicMemo`, and Arc Memo-through-UCW experiments are retained in project provenance as superseded R&D evidence. They are not the current product direction.
