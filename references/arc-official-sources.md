# Arc Official Sources

Internal reference for Arklake development.

This file is not product documentation and must not be exposed in the Arklake UI.

## Official Arc AI sources

### Arc MCP

https://docs.arc.io/ai/mcp

Use the official Arc MCP documentation when configuring or using
Arc documentation access through AI development tools.

### Arc LLM index

https://docs.arc.io/llms.txt

Use this as the primary machine-readable entry point for current
Arc documentation.

## Research rule

When an Arklake implementation decision depends on Arc behavior:

1. Start with the current official Arc documentation.
2. Use Arc llms.txt to locate the relevant documentation.
3. Use the official Arc MCP when available.
4. Do not rely on old Arklake copy, mockups or assumptions as proof.
5. Do not copy technical claims into public Arklake Docs without verification.

Always distinguish between:

- Arc infrastructure capability
- Circle infrastructure capability
- Arklake product direction
- Arklake implemented functionality

## Important

Arc documentation can change.

Do not treat information copied from previous research as permanently current.
Re-check the official source before making implementation decisions.

## Key implementation references

### Arc MCP

https://docs.arc.io/ai/mcp

Use this reference when configuring or using the official Arc MCP
for AI-assisted Arc documentation research.

The actual MCP endpoint should always be confirmed from the current
official Arc documentation before configuration.

### Unified Balance

https://docs.arc.io/app-kit/unified-balance

Use this reference before implementing Arklake features involving:

- Unified Balance
- Available to pay
- multi-chain USDC funding
- USDC spending across supported chains
- Circle Wallets + Unified Balance integration

Important:

Always check the current official documentation for wallet-model
and signing requirements before implementation.

Do not assume that Circle Wallets integration automatically means
Unified Balance spends can be signed directly by the wallet.

Keep these distinctions clear:

- Swap = asset conversion
- Unified Balance = USDC balance/spending infrastructure
- Gateway = underlying Circle infrastructure
- Paying an invoice = separate Arklake payment action
