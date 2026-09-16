import { ARC_TESTNET, EXPECTED_ARC_SCA, POLYGON_AMOY, POLYGON_GATEWAY_WALLET, discoverA2Wallets, requireGatewayPolygonWallet, parseUsdcDecimalToBaseUnits } from './gateway-burn-intent.mjs'

const stop = () => { throw new Error('A4.2a STOP: signing, challenges and transaction execution are forbidden during estimate.') }
const readActions = new Set(['token.allowance', 'token.balanceOf', 'token.name', 'native.balanceOf', 'usdc.allowance', 'usdc.balanceOf', 'usdc.name', 'gateway.v1.isDelegate', 'gateway.v1.withdrawingBalance', 'gateway.v1.withdrawalBlock'])

// Keep read/estimate methods available, but fail before any signing request can be created.
export function estimateOnlyAdapter(adapter) {
  return new Proxy(adapter, {
    get(target, key) {
      if (key === 'prepareAction') return async (action, ...args) => {
        if (action === 'gateway.v1.signBurnIntents') return stop()
        const prepared = await target.prepareAction(action, ...args)
        return new Proxy(prepared, { get(request, property) {
          if (property === 'execute' && !readActions.has(action)) return stop
          const value = Reflect.get(request, property, request)
          return typeof value === 'function' ? value.bind(request) : value
        } })
      }
      if (key === 'readAction') return (action, ...args) => {
        if (!readActions.has(action)) return stop()
        return target.readAction(action, ...args)
      }
      if (['executeAction', 'signTypedData', 'sendTransaction', 'sendCalls'].includes(key)) return stop
      const value = Reflect.get(target, key, target)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
}

export async function prepareUnifiedBalanceEstimate({ listWallets, readPolygonBytecode, readGatewayBalance, readArcBalance, createAdapter, createKit, apiKey, userToken, rpcUrls }) {
  const wallets = await listWallets()
  const { arcWallet } = discoverA2Wallets(wallets)
  const polygonWallet = requireGatewayPolygonWallet(wallets)
  if (arcWallet.accountType !== 'SCA') throw new Error('WRONG USER: expected Arc SCA account type.')
  const bytecode = await readPolygonBytecode(polygonWallet.address)
  if (typeof bytecode !== 'string' || !/^0x(?:[0-9a-fA-F]{2})+$/.test(bytecode)) throw new Error('A4.2a STOP: Polygon SCA bytecode must be readable and non-empty.')
  const [gatewayBalance, arcBalance] = await Promise.all([readGatewayBalance(polygonWallet.address), readArcBalance()])
  const balance = parseUsdcDecimalToBaseUnits(gatewayBalance)
  if (balance < 1_000_000n) throw new Error('A4.2a STOP: live Gateway balance is below 1 USDC.')
  if (!/^\d+$/.test(arcBalance)) throw new Error('Arc USDC balance is invalid.')
  const adapter = estimateOnlyAdapter(await createAdapter({ apiKey, userToken, wallets: [polygonWallet, arcWallet], rpcUrls, onChallenge: stop, resolveTypedDataSignature: stop }))
  const params = {
    from: { adapter, allocations: [{ amount: '1', chain: POLYGON_AMOY.chain }] },
    to: { adapter, chain: ARC_TESTNET.chain, recipientAddress: EXPECTED_ARC_SCA, useForwarder: false },
    amount: '1',
    token: 'USDC',
  }
  const kit = createKit()
  const result = await kit.unifiedBalance.estimateSpend(params)
  if (!Array.isArray(result?.fees)) throw new Error('Kit estimate did not return a fees array.')
  const fees = result.fees.map((fee) => {
    if (!['provider', 'gasFee', 'kit', 'forwarder'].includes(fee?.type) || fee.token !== 'USDC') throw new Error('Kit returned an unsupported fee.')
    parseUsdcDecimalToBaseUnits(fee.amount)
    if (fee.type === 'forwarder') throw new Error('Kit unexpectedly enabled Forwarder.')
    const allocations = fee.allocations?.map((allocation) => {
      if (allocation.chain !== POLYGON_AMOY.chain) throw new Error('Kit returned a fee allocation outside Polygon Amoy.')
      parseUsdcDecimalToBaseUnits(allocation.amount)
      return { chain: allocation.chain, amount: allocation.amount }
    })
    return { type: fee.type, token: fee.token, amount: fee.amount, ...(allocations ? { allocations } : {}) }
  })
  const required = 1_000_000n + fees.reduce((total, fee) => total + parseUsdcDecimalToBaseUnits(fee.amount), 0n)
  return {
    stage: 'a4_2a_estimate', success: balance >= required,
    ...(balance < required ? { error: 'Live Gateway balance cannot cover 1 USDC plus estimated fees.' } : {}),
    sourceChain: POLYGON_AMOY.chain, destinationChain: ARC_TESTNET.chain, amount: '1', token: 'USDC',
    sourceAddress: POLYGON_GATEWAY_WALLET, recipientAddress: EXPECTED_ARC_SCA, polygonScaBytecodeDetected: true,
    gatewayBalanceBefore: gatewayBalance, gatewayBalanceBeforeBaseUnits: balance.toString(), arcUsdcBalanceBeforeBaseUnits: arcBalance,
    allocations: [{ amount: '1', chain: POLYGON_AMOY.chain }], fees, requiredGatewayBaseUnits: required.toString(),
    expiration: null, expirationNote: 'estimateSpend returns fees only; no expiration is exposed.', useForwarder: false,
    spendEnabled: false, signingChallengeCreated: false, gatewayTransferSubmitted: false,
  }
}
