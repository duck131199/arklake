# Prototype 0 local Circle runner

This localhost-only runner creates exactly two Circle User-Controlled Wallet `contractExecution` challenges for the fixed Arc Testnet prototype fixture:

1. canonical USDC `approve(prototype, 10000)`;
2. prototype `pay(recipient, 10000, "ARK-PROTOTYPE-001", descriptionCommitment)`.

It also exposes one fixed atomic-batch challenge for the second runtime gate. The SCA calls
`executeBatch((address,uint256,bytes)[])` with exactly two inner calls: exact-amount USDC
approval followed by V2 prototype payment using `ARK-PROTOTYPE-V2-001` and plaintext memo
`Thanks Miley`. The V2 prototype address is `0x7Ef8D661e800ec959daAaE67A8bD4fAaAe3A43D7`,
and its payment ABI is `pay(address,uint256,string,string)`. A failure in either inner call
reverts the batch.

The runner also exposes one fixed Arc Memo plaintext payment. It calls the verified Arc
Testnet Memo contract directly through Circle `contractExecution`:

```solidity
memo(
  USDC,
  USDC.transfer(recipient, 10000),
  keccak256("arklake:prototype:memo:ARK-MEMO-001"),
  bytes("Thanks Miley")
)
```

This operation does not approve USDC and does not call the Arklake prototype contract.

It has no arbitrary contract, wallet, amount, or calldata input. The server verifies that the authenticated Circle user owns the fixed payer SCA before creating a challenge. The `pay` challenge is blocked until on-chain allowance is at least the exact test amount.

## Start

From the repository root, with the existing local Circle configuration available:

```powershell
node prototype/onchain-invoice-reference/local/server.mjs
```

Open `http://localhost:3000`. The Circle Web SDK uses this configured localhost origin; a different host or port cannot complete device initialization. Sign in with the fixed payer account by email OTP. The Circle Web SDK keeps the `encryptionKey` in browser memory and executes each challenge in the Circle dialog. The runner sends the short-lived `userToken` only to its localhost server for Circle API calls; it never writes or logs either credential.

Use **Approve exact 0.01 USDC** first. Wait until recovery shows a confirmed transaction and the displayed allowance updates. Then use **Pay prototype**. Challenge completion means submitted; the runner separately resolves `challengeId -> transactionId -> txHash` and displays Circle's transaction state.

Stopping and restarting the runner clears its in-memory challenge cache. This runner is test tooling only and is not a Vercel or production route.
