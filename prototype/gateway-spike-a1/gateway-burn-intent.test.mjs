import assert from 'node:assert/strict'
import test from 'node:test'
import { hashTypedData } from 'viem'
import { ARC_TESTNET, EXPECTED_ARC_SCA, GATEWAY_DEPOSIT_AMOUNT, GATEWAY_ESTIMATE_ENDPOINT, GATEWAY_TRANSFER_AMOUNT, GATEWAY_TRANSFER_ENDPOINT, POLYGON_AMOY, POLYGON_GATEWAY_WALLET, POLYGON_GATEWAY_WALLET_ID, SignatureRequestRegistry, SPIKE_AMOUNT, buildGatewayBurnIntent, buildGatewayDepositChallenge, buildGatewayTransferPreview, buildPolygonEoaProvisionRequest, buildPolygonProvisionRequest, buildPolygonToArcEstimateRequest, createGatewayDepositChallenge, discoverA2Wallets, extractGatewayEstimatedBurnIntent, gatewayEstimateNetworkDiagnostic, parseUsdcDecimalToBaseUnits, preparePolygonToArcTransfer, provisionPolygonEoa, provisionPolygonWallet, requireGatewayPolygonWallet, sanitizeGatewayTransferResponse, sanitizeGatewayTransferStatus, submitPreparedGatewayTransfer, validateEstimatedPolygonToArcBurnIntent } from './gateway-burn-intent.mjs'

const wallet = '0xd94074edb1da4c98959d455172beb58e4400324f'
const bytes32Wallet = `0x${wallet.slice(2).padStart(64, '0')}`

test('builds an Arc Testnet BurnIntent owned and signed by the same SCA', () => {
  const { burnIntent, typedData } = buildGatewayBurnIntent({ walletAddress: wallet, currentBlock: 123n, salt: `0x${'12'.repeat(32)}` })
  assert.equal(burnIntent.spec.sourceDomain, ARC_TESTNET.domain)
  assert.equal(burnIntent.spec.destinationDomain, ARC_TESTNET.domain)
  assert.equal(burnIntent.spec.sourceDepositor, bytes32Wallet)
  assert.equal(burnIntent.spec.sourceSigner, bytes32Wallet)
  assert.equal(burnIntent.spec.destinationRecipient, bytes32Wallet)
  assert.equal(burnIntent.spec.value, SPIKE_AMOUNT.toString())
  assert.equal(typedData.primaryType, 'BurnIntent')
  assert.deepEqual(typedData.message, burnIntent)
})

test('correlates a signature to its exact request and challenge', async () => {
  const registry = new SignatureRequestRegistry()
  const pending = registry.create('request-a', 'owner-a')
  registry.bindChallenge('request-a', 'challenge-a')
  assert.throws(() => registry.resolve('request-a', 'challenge-b', 'owner-a', `0x${'11'.repeat(65)}`), /correlation/)
  assert.throws(() => registry.resolve('request-a', 'challenge-a', 'owner-b', `0x${'11'.repeat(65)}`), /correlation/)
  registry.resolve('request-a', 'challenge-a', 'owner-a', `0x${'22'.repeat(65)}`)
  assert.equal(await pending, `0x${'22'.repeat(65)}`)
})

test('never supplies contractSigner from the BurnIntent builder', () => {
  const result = buildGatewayBurnIntent({ walletAddress: wallet, currentBlock: 1n, salt: `0x${'34'.repeat(32)}` })
  assert.equal(Object.hasOwn(result, 'contractSigner'), false)
  assert.equal(Object.hasOwn(result.typedData, 'contractSigner'), false)
})

test('A2 discovery requires the exact A1 Arc SCA before returning Polygon Amoy', () => {
  const polygon = { id: 'polygon-wallet', address: '0x1111111111111111111111111111111111111111', blockchain: 'MATIC-AMOY', accountType: 'SCA' }
  assert.throws(() => discoverA2Wallets([polygon]), /WRONG USER/)
  const result = discoverA2Wallets([
    { id: 'arc-wallet', address: wallet.toUpperCase().replace('0X', '0x'), blockchain: 'ARC-TESTNET', accountType: 'SCA' },
    polygon,
  ])
  assert.equal(result.arcWallet.address.toLowerCase(), wallet)
  assert.deepEqual(result.polygonWallet, polygon)
})

test('A2 discovery reports Polygon Amoy absent without provisioning it', () => {
  const result = discoverA2Wallets([{ id: 'arc-wallet', address: wallet, blockchain: 'ARC-TESTNET', accountType: 'SCA' }])
  assert.equal(result.polygonWallet, null)
})

test('A2.1 builds only the official MATIC-AMOY SCA wallet request after Arc correlation', () => {
  const request = buildPolygonProvisionRequest(
    [{ id: 'arc-wallet', address: wallet, blockchain: 'ARC-TESTNET', accountType: 'SCA' }],
    '12345678-1234-4234-9234-123456789abc',
  )
  assert.deepEqual(request.blockchains, ['MATIC-AMOY'])
  assert.equal(request.accountType, 'SCA')
  assert.equal(request.metadata.length, 1)
  assert.equal(Object.hasOwn(request, 'walletSetId'), false)
})

test('A2.1 refuses provisioning for the wrong user or an existing Polygon wallet', () => {
  const key = '12345678-1234-4234-9234-123456789abc'
  assert.throws(() => buildPolygonProvisionRequest([], key), /WRONG USER/)
  assert.throws(() => buildPolygonProvisionRequest([
    { id: 'arc-wallet', address: wallet, blockchain: 'ARC-TESTNET', accountType: 'SCA' },
    { id: 'polygon-wallet', address: wallet, blockchain: 'MATIC-AMOY', accountType: 'SCA' },
  ], key), /already exists/)
})

test('A2.1 orchestration uses a stubbed create call and never reaches Circle in tests', async () => {
  let created
  const response = await provisionPolygonWallet({
    listWallets: async () => [{ id: 'arc-wallet', address: wallet, blockchain: 'ARC-TESTNET', accountType: 'SCA' }],
    createWallet: async (request) => { created = request; return { data: { challengeId: 'mock-challenge' } } },
    idempotencyKey: '12345678-1234-4234-9234-123456789abc',
  })
  assert.equal(created.accountType, 'SCA')
  assert.deepEqual(created.blockchains, ['MATIC-AMOY'])
  assert.equal(response.data.challengeId, 'mock-challenge')
})

test('A3.3a distinguishes a Polygon EOA from the existing Polygon SCA', () => {
  const eoa = { id: 'polygon-eoa', address: '0x4444444444444444444444444444444444444444', blockchain: 'MATIC-AMOY', accountType: 'EOA' }
  const result = discoverA2Wallets([...correlatedWallets, eoa])
  assert.equal(result.polygonWallet.id, POLYGON_GATEWAY_WALLET_ID)
  assert.deepEqual(result.polygonEoa, eoa)
})

test('A3.3a builds and executes only a mocked Circle UCW EOA creation request', async () => {
  const idempotencyKey = '123e4567-e89b-42d3-a456-426614174002'
  const request = buildPolygonEoaProvisionRequest(correlatedWallets, idempotencyKey)
  assert.deepEqual(request.blockchains, ['MATIC-AMOY'])
  assert.equal(request.accountType, 'EOA')
  let created
  const result = await provisionPolygonEoa({
    listWallets: async () => correlatedWallets,
    createWallet: async (body) => { created = body; return { data: { challengeId: 'mock-eoa-challenge' } } },
    idempotencyKey,
  })
  assert.deepEqual(created, request)
  assert.equal(result.data.challengeId, 'mock-eoa-challenge')
})

test('A3.3a refuses EOA provisioning without exact SCA correlation or when an EOA exists', () => {
  const idempotencyKey = '123e4567-e89b-42d3-a456-426614174003'
  assert.throws(() => buildPolygonEoaProvisionRequest(correlatedWallets.filter((item) => item.blockchain !== 'MATIC-AMOY'), idempotencyKey), /expected Polygon Amoy SCA/)
  assert.throws(() => buildPolygonEoaProvisionRequest([...correlatedWallets, { id: 'eoa', address: wallet, blockchain: 'MATIC-AMOY', accountType: 'EOA' }], idempotencyKey), /already exists/)
})

const gatewayWalletRecord = { id: POLYGON_GATEWAY_WALLET_ID, address: POLYGON_GATEWAY_WALLET, blockchain: 'MATIC-AMOY', accountType: 'SCA' }
const correlatedWallets = [{ id: 'arc-wallet', address: wallet, blockchain: 'ARC-TESTNET', accountType: 'SCA' }, gatewayWalletRecord]

test('A2.3 requires exact user and Polygon SCA correlation', () => {
  assert.equal(requireGatewayPolygonWallet(correlatedWallets).id, POLYGON_GATEWAY_WALLET_ID)
  assert.throws(() => requireGatewayPolygonWallet([correlatedWallets[0], { ...gatewayWalletRecord, address: wallet }]), /WRONG USER/)
})

test('A2.3 builds exact approve and deposit contract executions', () => {
  assert.deepEqual(buildGatewayDepositChallenge('approve', gatewayWalletRecord, 0n), {
    walletId: POLYGON_GATEWAY_WALLET_ID,
    contractAddress: POLYGON_AMOY.usdc,
    abiFunctionSignature: 'approve(address,uint256)',
    abiParameters: [POLYGON_AMOY.gatewayWallet, GATEWAY_DEPOSIT_AMOUNT.toString()],
    feeLevel: 'MEDIUM',
  })
  assert.throws(() => buildGatewayDepositChallenge('deposit', gatewayWalletRecord, GATEWAY_DEPOSIT_AMOUNT - 1n), /locked/)
  assert.equal(buildGatewayDepositChallenge('deposit', gatewayWalletRecord, GATEWAY_DEPOSIT_AMOUNT).abiFunctionSignature, 'deposit(address,uint256)')
})

test('A2.3 orchestration uses mocks and blocks deposit before verified allowance', async () => {
  let submitted
  await assert.rejects(createGatewayDepositChallenge({
    operation: 'deposit', listWallets: async () => correlatedWallets, readAllowance: async () => 0n,
    createChallenge: async () => { throw new Error('must not submit') }, idempotencyKey: 'mock-key',
  }), /locked/)
  const result = await createGatewayDepositChallenge({
    operation: 'approve', listWallets: async () => correlatedWallets, readAllowance: async () => 0n,
    createChallenge: async (request) => { submitted = request; return { data: { challengeId: 'mock-approve' } } }, idempotencyKey: 'mock-key',
  })
  assert.equal(submitted.abiParameters[1], '2000000')
  assert.equal(result.data.challengeId, 'mock-approve')
})

test('A3.1 builds an exact Polygon Gateway to Arc estimate without fee guesses', () => {
  const request = buildPolygonToArcEstimateRequest({ sourceAddress: POLYGON_GATEWAY_WALLET, destinationAddress: EXPECTED_ARC_SCA, salt: `0x${'56'.repeat(32)}` })
  assert.equal(request.length, 1)
  assert.equal(request[0].spec.sourceDomain, 7)
  assert.equal(request[0].spec.destinationDomain, 26)
  assert.equal(request[0].spec.value, GATEWAY_TRANSFER_AMOUNT.toString())
  assert.equal(Object.hasOwn(request[0], 'maxFee'), false)
  assert.equal(Object.hasOwn(request[0], 'maxBlockHeight'), false)
})

test('A3.1 accepts only an estimate preserving every fixed transfer field', () => {
  const request = buildPolygonToArcEstimateRequest({ sourceAddress: POLYGON_GATEWAY_WALLET, destinationAddress: EXPECTED_ARC_SCA, salt: `0x${'67'.repeat(32)}` })
  const burnIntent = { ...request[0], maxBlockHeight: '999999', maxFee: '1550' }
  assert.deepEqual(validateEstimatedPolygonToArcBurnIntent(burnIntent).typedData.message, burnIntent)
  assert.throws(() => validateEstimatedPolygonToArcBurnIntent({ ...burnIntent, spec: { ...burnIntent.spec, value: '2' } }), /value/)
})

test('A3.1 normalizes every live estimate address for both EIP-712 and transfer submission', () => {
  const request = buildPolygonToArcEstimateRequest({ sourceAddress: POLYGON_GATEWAY_WALLET, destinationAddress: EXPECTED_ARC_SCA, salt: `0x${'68'.repeat(32)}` })
  const addressFields = ['sourceContract', 'destinationContract', 'sourceToken', 'destinationToken', 'sourceDepositor', 'destinationRecipient', 'sourceSigner', 'destinationCaller']
  const runtimeSpec = { ...request[0].spec }
  for (const field of addressFields) runtimeSpec[field] = `0x${runtimeSpec[field].slice(-40)}`
  const runtimeBurnIntent = { maxBlockHeight: '48346574', maxFee: '1650', spec: runtimeSpec }
  const extracted = extractGatewayEstimatedBurnIntent([{ burnIntent: runtimeBurnIntent }])
  const { burnIntent, typedData } = validateEstimatedPolygonToArcBurnIntent(extracted)
  assert.equal(burnIntent.maxFee, '1650')
  assert.equal(burnIntent.maxBlockHeight, '48346574')
  assert.equal(burnIntent.spec.salt, request[0].spec.salt)
  for (const field of addressFields) {
    assert.equal(burnIntent.spec[field].length, 66)
    assert.equal(typedData.message.spec[field], burnIntent.spec[field])
  }
  assert.match(hashTypedData(typedData), /^0x[0-9a-f]{64}$/)
})

test('A3.1 keeps documented estimate compatibility and rejects malformed or mismatched responses', () => {
  const request = buildPolygonToArcEstimateRequest({ sourceAddress: POLYGON_GATEWAY_WALLET, destinationAddress: EXPECTED_ARC_SCA, salt: `0x${'69'.repeat(32)}` })
  const burnIntent = { ...request[0], maxBlockHeight: '48346574', maxFee: '1650' }
  assert.equal(extractGatewayEstimatedBurnIntent({ body: [{ burnIntent }] }), burnIntent)
  assert.throws(() => extractGatewayEstimatedBurnIntent({ body: [] }), /did not include/)
  assert.throws(() => validateEstimatedPolygonToArcBurnIntent({ ...burnIntent, maxFee: 1650 }), /fee, expiry, and salt/)
  assert.throws(() => validateEstimatedPolygonToArcBurnIntent({ ...burnIntent, spec: { ...burnIntent.spec, sourceDomain: 0 } }), /sourceDomain/)
  assert.throws(() => validateEstimatedPolygonToArcBurnIntent({ ...burnIntent, spec: { ...burnIntent.spec, sourceToken: '0x1234' } }), /invalid address field/)
})

test('A3.1 produces only a redacted non-submitting transfer preview', () => {
  const request = buildPolygonToArcEstimateRequest({ sourceAddress: POLYGON_GATEWAY_WALLET, destinationAddress: EXPECTED_ARC_SCA, salt: `0x${'78'.repeat(32)}` })
  const burnIntent = { ...request[0], maxBlockHeight: '999999', maxFee: '1550' }
  const preview = buildGatewayTransferPreview({ burnIntent, contractSigner: true, signatureObtained: true, gatewayBalanceBefore: '2000000' })
  assert.equal(preview.endpoint, GATEWAY_TRANSFER_ENDPOINT)
  assert.equal(preview.requestBody[0].signature, '<REDACTED>')
  assert.equal(preview.submitted, false)
  assert.equal(JSON.stringify(preview).includes('0x' + '11'.repeat(65)), false)
})

test('A3.1 orchestration mocks Gateway and Circle and exposes no transfer submission step', async () => {
  let estimateCalls = 0
  let signCalls = 0
  let preparedCalls = 0
  let signedBurnIntent
  const salt = `0x${'89'.repeat(32)}`
  const preview = await preparePolygonToArcTransfer({
    sourceAddress: POLYGON_GATEWAY_WALLET,
    destinationAddress: EXPECTED_ARC_SCA,
    gatewayBalanceBefore: '2000000',
    salt,
    estimateTransfer: async (request) => {
      estimateCalls += 1
      return [{ burnIntent: { ...request[0], maxBlockHeight: '999999', maxFee: '1550' } }]
    },
    onPrepared: async () => { preparedCalls += 1 },
    onSigned: async ({ burnIntent, signature }) => { signedBurnIntent = { burnIntent, signature } },
    signBurnIntent: async (typedData) => {
      signCalls += 1
      assert.equal(typedData.message.spec.salt, salt)
      return { contractSigner: true, signature: `0x${'11'.repeat(65)}` }
    },
  })
  assert.equal(estimateCalls, 1)
  assert.equal(signCalls, 1)
  assert.equal(preparedCalls, 1)
  assert.deepEqual(signedBurnIntent.burnIntent, preview.requestBody[0].burnIntent)
  assert.equal(signedBurnIntent.signature, `0x${'11'.repeat(65)}`)
  for (const field of ['sourceContract', 'destinationContract', 'sourceToken', 'destinationToken', 'sourceDepositor', 'destinationRecipient', 'sourceSigner', 'destinationCaller']) {
    assert.equal(signedBurnIntent.burnIntent.spec[field].length, 66)
  }
  assert.equal(preview.submitted, false)
  assert.deepEqual(Object.keys(preview.requestBody[0]), ['burnIntent', 'signature'])
  assert.equal(preview.requestBody[0].signature, '<REDACTED>')
})

test('A3.1 exposes only allowlisted Gateway estimate network diagnostics', () => {
  const cause = Object.assign(new Error('connect EACCES 203.0.113.1:443'), {
    code: 'EACCES', errno: -4092, syscall: 'connect', hostname: 'gateway-api-testnet.circle.com',
  })
  const error = new TypeError('fetch failed', { cause })
  const diagnostic = gatewayEstimateNetworkDiagnostic(error)
  assert.deepEqual(diagnostic, {
    stage: 'gateway_estimate',
    url: GATEWAY_ESTIMATE_ENDPOINT,
    error: { name: 'TypeError', message: 'fetch failed' },
    cause: { code: 'EACCES', errno: '-4092', syscall: 'connect', hostname: 'gateway-api-testnet.circle.com', message: 'connect EACCES 203.0.113.1:443' },
  })
  assert.equal(JSON.stringify(diagnostic).includes('userToken'), false)
})

test('A3.1 parses Gateway decimal USDC balances exactly into six-decimal base units', () => {
  assert.equal(parseUsdcDecimalToBaseUnits('2.000000'), 2_000_000n)
  assert.equal(parseUsdcDecimalToBaseUnits('1.000000'), 1_000_000n)
  assert.equal(parseUsdcDecimalToBaseUnits('0.999999'), 999_999n)
  assert.equal(parseUsdcDecimalToBaseUnits('0.000001'), 1n)
  for (const malformed of ['2.0000000', '1e3', '-1', '.5', '1.', 'NaN', '', null]) {
    assert.throws(() => parseUsdcDecimalToBaseUnits(malformed), /invalid USDC balance/)
  }
})

test('A3.2 submits the exact stored payload once through a mocked transfer call', async () => {
  const burnIntent = { maxBlockHeight: '48346574', maxFee: '1650', spec: { value: '1000000', salt: `0x${'91'.repeat(32)}` } }
  const signature = `0x${'12'.repeat(65)}`
  const record = { owner: 'owner-a', state: 'READY', burnIntent, signature }
  let calls = 0
  let submittedBody
  const result = await submitPreparedGatewayTransfer({
    record, owner: 'owner-a', submitTransfer: async (body) => { calls += 1; submittedBody = body; return { response: { ok: true, status: 201 }, payload: { transferId: 'mock-transfer' } } },
  })
  assert.equal(calls, 1)
  assert.deepEqual(submittedBody, [{ burnIntent, signature }])
  assert.equal(result.payload.transferId, 'mock-transfer')
  assert.equal(record.state, 'SUBMITTED')
  await assert.rejects(submitPreparedGatewayTransfer({ record, owner: 'owner-a', submitTransfer: async () => { calls += 1 } }), /already been submitted/)
  assert.equal(calls, 1)
})

test('A3.2 rejects wrong sessions and sanitizes transfer responses without secrets', async () => {
  await assert.rejects(submitPreparedGatewayTransfer({ record: { owner: 'owner-a', state: 'READY' }, owner: 'owner-b', submitTransfer: async () => {} }), /not available/)
  assert.deepEqual(sanitizeGatewayTransferResponse({ transferId: 'id', attestation: '0x1234', signature: '0xabcd', expirationBlock: '99', fees: { total: '0.1' } }), {
    transferId: 'id', expirationBlock: '99', fees: { total: '0.1' }, attestationObtained: true, operatorSignatureObtained: true,
  })
  assert.deepEqual(sanitizeGatewayTransferStatus({ destinationDomain: 26, status: 'confirmed', transactionHash: '0xabc', forwardingDetails: { forwardingEnabled: true }, attestation: null }), {
    destinationDomain: 26, status: 'confirmed', transactionHash: '0xabc', forwardingEnabled: true, forwardingFailureReason: null,
    burnIntents: [], attestationAvailable: false, attestationExpirationBlock: null,
  })
})

test('A3.2 failed submission is final and preserves a safe contract-signature error', async () => {
  const record = { owner: 'owner-a', state: 'READY', burnIntent: { spec: {} }, signature: `0x${'33'.repeat(65)}` }
  await assert.rejects(submitPreparedGatewayTransfer({
    record,
    owner: 'owner-a',
    submitTransfer: async () => { throw new Error('invalid contract signature') },
  }), /invalid contract signature/)
  assert.equal(record.state, 'FAILED_FINAL')
  await assert.rejects(submitPreparedGatewayTransfer({ record, owner: 'owner-a', submitTransfer: async () => {} }), /already been submitted/)
  assert.equal(sanitizeGatewayTransferResponse({ code: 400, message: 'invalid contract signature' }).message, 'invalid contract signature')
})
