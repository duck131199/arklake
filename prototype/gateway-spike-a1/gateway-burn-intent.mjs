import { randomBytes } from 'node:crypto'

export const ARC_TESTNET = Object.freeze({
  blockchain: 'ARC-TESTNET',
  chain: 'Arc_Testnet',
  chainId: 5042002,
  domain: 26,
  gatewayWallet: '0x0077777d7EBA4688BDeF3E311b846F25870A19B9',
  gatewayMinter: '0x0022222ABE238Cc2C7Bb1f21003F0a260052475B',
  usdc: '0x3600000000000000000000000000000000000000',
})

export const SPIKE_AMOUNT = 10_000n
export const SPIKE_MAX_FEE = 10_000n
export const SPIKE_BLOCK_WINDOW = 100_000n
export const EXPECTED_ARC_SCA = '0xd94074edb1da4c98959d455172beb58e4400324f'
export const POLYGON_AMOY = Object.freeze({
  blockchain: 'MATIC-AMOY',
  chain: 'Polygon_Amoy_Testnet',
  chainId: 80002,
  domain: 7,
  usdc: '0x41e94eb019c0762f9bfcf9fb1e58725bfb0e7582',
  gatewayWallet: '0x0077777d7eba4688bdef3e311b846f25870a19b9',
  rpc: 'https://polygon-amoy-bor-rpc.publicnode.com',
})
export const POLYGON_GATEWAY_WALLET_ID = '2a7cb0cf-ea80-52b2-be7d-96ec0dcf1ea1'
export const POLYGON_GATEWAY_WALLET = '0x23d9e79e4dde2b3f85dda67c82b699ba111b8226'
export const GATEWAY_DEPOSIT_AMOUNT = 2_000_000n
export const GATEWAY_TRANSFER_AMOUNT = 1_000_000n
export const GATEWAY_TRANSFER_ENDPOINT = 'https://gateway-api-testnet.circle.com/v1/transfer'
export const GATEWAY_ESTIMATE_ENDPOINT = 'https://gateway-api-testnet.circle.com/v1/estimate'

const zeroAddress = '0x0000000000000000000000000000000000000000'

export function parseUsdcDecimalToBaseUnits(value) {
  if (typeof value !== 'string' || !/^(0|[1-9]\d*)(?:\.(\d{1,6}))?$/.test(value)) {
    throw new Error('Gateway returned an invalid USDC balance.')
  }
  const [whole, fraction = ''] = value.split('.')
  return BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, '0') || '0')
}

function safeDiagnosticValue(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const text = String(value).slice(0, 300)
  return /authorization|bearer|api[_ -]?key|user.?token|encryption|signature\s*[:=]\s*0x/i.test(text) ? '[REDACTED]' : text
}

export function gatewayEstimateNetworkDiagnostic(error) {
  const cause = error instanceof Error && error.cause && typeof error.cause === 'object' ? error.cause : null
  return {
    stage: 'gateway_estimate',
    url: GATEWAY_ESTIMATE_ENDPOINT,
    error: {
      name: safeDiagnosticValue(error?.name),
      message: safeDiagnosticValue(error?.message),
    },
    cause: {
      code: safeDiagnosticValue(cause?.code),
      errno: safeDiagnosticValue(cause?.errno),
      syscall: safeDiagnosticValue(cause?.syscall),
      hostname: safeDiagnosticValue(cause?.hostname),
      message: safeDiagnosticValue(cause?.message),
    },
  }
}

export function addressToBytes32(address) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) throw new Error('Expected an EVM address.')
  return `0x${address.slice(2).toLowerCase().padStart(64, '0')}`
}

export function discoverA2Wallets(wallets) {
  if (!Array.isArray(wallets)) throw new Error('Circle wallet list is invalid.')
  const arcWallet = wallets.find((wallet) => wallet?.blockchain === ARC_TESTNET.blockchain && wallet?.address?.toLowerCase() === EXPECTED_ARC_SCA)
  if (!arcWallet) throw Object.assign(new Error('WRONG USER: authenticated Circle user does not own the expected Arc Testnet SCA.'), { code: 'WRONG_USER' })
  const polygonWallet = wallets.find((wallet) => wallet?.blockchain === POLYGON_AMOY.blockchain && wallet?.accountType === 'SCA') || null
  const polygonEoa = wallets.find((wallet) => wallet?.blockchain === POLYGON_AMOY.blockchain && wallet?.accountType === 'EOA') || null
  const safe = (wallet) => wallet && ({ id: wallet.id, address: wallet.address, blockchain: wallet.blockchain, accountType: wallet.accountType })
  return { arcWallet: safe(arcWallet), polygonWallet: safe(polygonWallet), polygonEoa: safe(polygonEoa) }
}

function requireUuidV4(value) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new Error('A UUID v4 idempotency key is required.')
}

export function buildPolygonProvisionRequest(wallets, idempotencyKey) {
  const discovered = discoverA2Wallets(wallets)
  if (discovered.polygonWallet) throw Object.assign(new Error('MATIC-AMOY wallet already exists.'), { code: 'WALLET_EXISTS' })
  requireUuidV4(idempotencyKey)
  return {
    idempotencyKey,
    blockchains: [POLYGON_AMOY.blockchain],
    accountType: 'SCA',
    metadata: [{ name: 'Arklake Gateway A2 Polygon Amoy', refId: 'gateway-a2-polygon-amoy' }],
  }
}

export function buildPolygonEoaProvisionRequest(wallets, idempotencyKey) {
  const discovered = discoverA2Wallets(wallets)
  if (!discovered.polygonWallet || discovered.polygonWallet.address?.toLowerCase() !== POLYGON_GATEWAY_WALLET || discovered.polygonWallet.id !== POLYGON_GATEWAY_WALLET_ID) {
    throw Object.assign(new Error('WRONG USER: expected Polygon Amoy SCA correlation failed.'), { code: 'WRONG_USER' })
  }
  if (discovered.polygonEoa) throw Object.assign(new Error('MATIC-AMOY EOA already exists.'), { code: 'WALLET_EXISTS' })
  requireUuidV4(idempotencyKey)
  return {
    idempotencyKey,
    blockchains: [POLYGON_AMOY.blockchain],
    accountType: 'EOA',
    metadata: [{ name: 'Arklake Gateway A3 Delegate Test', refId: 'gateway-a3-polygon-amoy-eoa' }],
  }
}

export async function provisionPolygonEoa({ listWallets, createWallet, idempotencyKey }) {
  return createWallet(buildPolygonEoaProvisionRequest(await listWallets(), idempotencyKey))
}

export async function provisionPolygonWallet({ listWallets, createWallet, idempotencyKey }) {
  const wallets = await listWallets()
  const request = buildPolygonProvisionRequest(wallets, idempotencyKey)
  return createWallet(request)
}

export function requireGatewayPolygonWallet(wallets) {
  const discovered = discoverA2Wallets(wallets)
  const wallet = discovered.polygonWallet
  if (!wallet || wallet.id !== POLYGON_GATEWAY_WALLET_ID || wallet.address?.toLowerCase() !== POLYGON_GATEWAY_WALLET || wallet.accountType !== 'SCA') {
    throw Object.assign(new Error('WRONG USER: authenticated Circle user does not own the expected Polygon Amoy SCA.'), { code: 'WRONG_USER' })
  }
  return wallet
}

export function buildGatewayDepositChallenge(operation, wallet, allowance) {
  if (wallet?.id !== POLYGON_GATEWAY_WALLET_ID || wallet?.address?.toLowerCase() !== POLYGON_GATEWAY_WALLET || wallet?.accountType !== 'SCA') {
    throw new Error('Expected the fixed Polygon Amoy Circle SCA.')
  }
  if (operation === 'approve') {
    return {
      walletId: wallet.id,
      contractAddress: POLYGON_AMOY.usdc,
      abiFunctionSignature: 'approve(address,uint256)',
      abiParameters: [POLYGON_AMOY.gatewayWallet, GATEWAY_DEPOSIT_AMOUNT.toString()],
      feeLevel: 'MEDIUM',
    }
  }
  if (operation === 'deposit') {
    if (BigInt(allowance) < GATEWAY_DEPOSIT_AMOUNT) throw Object.assign(new Error('Gateway deposit is locked until the exact on-chain allowance is verified.'), { code: 'ALLOWANCE_REQUIRED' })
    return {
      walletId: wallet.id,
      contractAddress: POLYGON_AMOY.gatewayWallet,
      abiFunctionSignature: 'deposit(address,uint256)',
      abiParameters: [POLYGON_AMOY.usdc, GATEWAY_DEPOSIT_AMOUNT.toString()],
      feeLevel: 'MEDIUM',
    }
  }
  throw new Error('Unsupported Gateway operation.')
}

export async function createGatewayDepositChallenge({ operation, listWallets, readAllowance, createChallenge, idempotencyKey }) {
  const wallet = requireGatewayPolygonWallet(await listWallets())
  const allowance = await readAllowance(wallet.address)
  const request = buildGatewayDepositChallenge(operation, wallet, allowance)
  return createChallenge({ idempotencyKey, ...request })
}

function burnIntentTypedData(burnIntent) {
  const addressFields = ['sourceContract', 'destinationContract', 'sourceToken', 'destinationToken', 'sourceDepositor', 'destinationRecipient', 'sourceSigner', 'destinationCaller']
  const normalizedSpec = { ...burnIntent.spec }
  for (const field of addressFields) normalizedSpec[field] = normalizeAddressBytes32(normalizedSpec[field])
  return {
    domain: { name: 'GatewayWallet', version: '1' },
    primaryType: 'BurnIntent',
    types: {
      EIP712Domain: [
        { name: 'name', type: 'string' },
        { name: 'version', type: 'string' },
      ],
      TransferSpec: [
        { name: 'version', type: 'uint32' },
        { name: 'sourceDomain', type: 'uint32' },
        { name: 'destinationDomain', type: 'uint32' },
        { name: 'sourceContract', type: 'bytes32' },
        { name: 'destinationContract', type: 'bytes32' },
        { name: 'sourceToken', type: 'bytes32' },
        { name: 'destinationToken', type: 'bytes32' },
        { name: 'sourceDepositor', type: 'bytes32' },
        { name: 'destinationRecipient', type: 'bytes32' },
        { name: 'sourceSigner', type: 'bytes32' },
        { name: 'destinationCaller', type: 'bytes32' },
        { name: 'value', type: 'uint256' },
        { name: 'salt', type: 'bytes32' },
        { name: 'hookData', type: 'bytes' },
      ],
      BurnIntent: [
        { name: 'maxBlockHeight', type: 'uint256' },
        { name: 'maxFee', type: 'uint256' },
        { name: 'spec', type: 'TransferSpec' },
      ],
    },
    message: { ...burnIntent, spec: normalizedSpec },
  }
}

function normalizeAddressBytes32(value) {
  if (/^0x[0-9a-fA-F]{40}$/.test(value)) return addressToBytes32(value)
  if (/^0x[0-9a-fA-F]{64}$/.test(value)) return value.toLowerCase()
  throw new Error('Gateway estimate returned an invalid address field.')
}

export function buildPolygonToArcEstimateRequest({ sourceAddress, destinationAddress, salt = `0x${randomBytes(32).toString('hex')}` }) {
  if (sourceAddress?.toLowerCase() !== POLYGON_GATEWAY_WALLET) throw new Error('Expected the fixed Polygon source SCA.')
  if (destinationAddress?.toLowerCase() !== EXPECTED_ARC_SCA) throw new Error('Expected the fixed Arc destination SCA.')
  if (!/^0x[0-9a-fA-F]{64}$/.test(salt)) throw new Error('Expected a bytes32 salt.')
  return [{
    spec: {
      version: 1,
      sourceDomain: POLYGON_AMOY.domain,
      destinationDomain: ARC_TESTNET.domain,
      sourceContract: addressToBytes32(POLYGON_AMOY.gatewayWallet),
      destinationContract: addressToBytes32(ARC_TESTNET.gatewayMinter),
      sourceToken: addressToBytes32(POLYGON_AMOY.usdc),
      destinationToken: addressToBytes32(ARC_TESTNET.usdc),
      sourceDepositor: addressToBytes32(sourceAddress),
      destinationRecipient: addressToBytes32(destinationAddress),
      sourceSigner: addressToBytes32(sourceAddress),
      destinationCaller: addressToBytes32(zeroAddress),
      value: GATEWAY_TRANSFER_AMOUNT.toString(),
      salt,
      hookData: '0x',
    },
  }]
}

export function validateEstimatedPolygonToArcBurnIntent(burnIntent) {
  if (!burnIntent || typeof burnIntent.maxBlockHeight !== 'string' || !/^\d+$/.test(burnIntent.maxBlockHeight)
    || typeof burnIntent.maxFee !== 'string' || !/^\d+$/.test(burnIntent.maxFee)
    || !/^0x[0-9a-fA-F]{64}$/.test(burnIntent.spec?.salt || '')) throw new Error('Gateway estimate did not return valid fee, expiry, and salt fields.')
  const expected = buildPolygonToArcEstimateRequest({
    sourceAddress: POLYGON_GATEWAY_WALLET,
    destinationAddress: EXPECTED_ARC_SCA,
    salt: burnIntent.spec.salt,
  })[0].spec
  const addressFields = new Set(['sourceContract', 'destinationContract', 'sourceToken', 'destinationToken', 'sourceDepositor', 'destinationRecipient', 'sourceSigner', 'destinationCaller'])
  for (const [key, value] of Object.entries(expected)) {
    const actual = burnIntent.spec?.[key]
    const matches = addressFields.has(key)
      ? normalizeAddressBytes32(actual) === normalizeAddressBytes32(value)
      : typeof value === 'string' && value.startsWith('0x')
        ? actual?.toLowerCase() === value.toLowerCase()
        : String(actual) === String(value)
    if (!matches) {
      throw new Error(`Gateway estimate changed the fixed ${key}.`)
    }
  }
  const normalizedBurnIntent = {
    ...burnIntent,
    spec: { ...burnIntent.spec },
  }
  for (const field of addressFields) normalizedBurnIntent.spec[field] = normalizeAddressBytes32(normalizedBurnIntent.spec[field])
  return { burnIntent: normalizedBurnIntent, typedData: burnIntentTypedData(normalizedBurnIntent) }
}

export function extractGatewayEstimatedBurnIntent(estimate) {
  const item = Array.isArray(estimate) ? estimate[0] : estimate?.body?.[0]
  if (!item?.burnIntent) throw new Error('Gateway estimate response did not include a BurnIntent.')
  return item.burnIntent
}

export function buildGatewayTransferPreview({ burnIntent, contractSigner, signatureObtained, gatewayBalanceBefore }) {
  validateEstimatedPolygonToArcBurnIntent(burnIntent)
  if (BigInt(gatewayBalanceBefore) < GATEWAY_TRANSFER_AMOUNT) throw new Error('Gateway available balance is below 1 USDC.')
  return {
    amount: GATEWAY_TRANSFER_AMOUNT.toString(),
    source: { chain: 'Polygon Amoy', domain: POLYGON_AMOY.domain },
    sourceDepositor: POLYGON_GATEWAY_WALLET,
    sourceSigner: POLYGON_GATEWAY_WALLET,
    destination: { chain: 'Arc Testnet', domain: ARC_TESTNET.domain },
    destinationRecipient: EXPECTED_ARC_SCA,
    contractSigner: Boolean(contractSigner),
    signatureObtained: Boolean(signatureObtained),
    gatewayBalanceBefore: String(gatewayBalanceBefore),
    endpoint: GATEWAY_TRANSFER_ENDPOINT,
    requestBody: [{ burnIntent, signature: '<REDACTED>' }],
    submitted: false,
  }
}

export async function preparePolygonToArcTransfer({ sourceAddress, destinationAddress, gatewayBalanceBefore, estimateTransfer, signBurnIntent, salt, onPrepared, onSigned }) {
  if (BigInt(gatewayBalanceBefore) < GATEWAY_TRANSFER_AMOUNT) throw new Error('Gateway available balance is below 1 USDC.')
  const estimateRequest = buildPolygonToArcEstimateRequest({ sourceAddress, destinationAddress, salt })
  const estimate = await estimateTransfer(estimateRequest)
  const { burnIntent, typedData } = validateEstimatedPolygonToArcBurnIntent(extractGatewayEstimatedBurnIntent(estimate))
  await onPrepared?.({ burnIntent, fees: estimate?.fees || null })
  const signed = await signBurnIntent(typedData)
  if (typeof signed?.signature !== 'string' || !/^0x[0-9a-fA-F]+$/.test(signed.signature)) throw new Error('Circle signing did not return a valid signature.')
  await onSigned?.({ burnIntent, signature: signed.signature, contractSigner: Boolean(signed.contractSigner) })
  return buildGatewayTransferPreview({
    burnIntent,
    contractSigner: signed?.contractSigner,
    signatureObtained: typeof signed?.signature === 'string' && signed.signature.length > 2,
    gatewayBalanceBefore,
  })
}

export function sanitizeGatewayTransferResponse(payload) {
  if (!payload || typeof payload !== 'object') return { message: 'Gateway returned a non-JSON response.' }
  return {
    ...(typeof payload.transferId === 'string' ? { transferId: payload.transferId } : {}),
    ...(typeof payload.code === 'string' || typeof payload.code === 'number' ? { code: payload.code } : {}),
    ...(typeof payload.message === 'string' ? { message: safeDiagnosticValue(payload.message) } : {}),
    ...(typeof payload.expirationBlock === 'string' ? { expirationBlock: payload.expirationBlock } : {}),
    ...(payload.fees && typeof payload.fees === 'object' ? { fees: payload.fees } : {}),
    attestationObtained: typeof payload.attestation === 'string' && payload.attestation.startsWith('0x'),
    operatorSignatureObtained: typeof payload.signature === 'string' && payload.signature.startsWith('0x'),
  }
}

export function sanitizeGatewayTransferStatus(payload) {
  if (!payload || typeof payload !== 'object') return { status: 'unknown' }
  return {
    destinationDomain: payload.destinationDomain,
    status: typeof payload.status === 'string' ? payload.status : 'unknown',
    transactionHash: typeof payload.transactionHash === 'string' ? payload.transactionHash : null,
    forwardingEnabled: Boolean(payload.forwardingDetails?.forwardingEnabled),
    forwardingFailureReason: safeDiagnosticValue(payload.forwardingDetails?.failureReason),
    burnIntents: Array.isArray(payload.burnIntents) ? payload.burnIntents.map((item) => ({
      transferSpecHash: item?.transferSpecHash,
      maxBlockHeight: item?.maxBlockHeight,
      maxFee: item?.maxFee,
    })) : [],
    attestationAvailable: Boolean(payload.attestation?.payload && payload.attestation?.signature),
    attestationExpirationBlock: payload.attestation?.expirationBlock || null,
  }
}

export async function submitPreparedGatewayTransfer({ record, owner, submitTransfer }) {
  if (!record || record.owner !== owner) throw new Error('A3.1 signed payload is not available for this session.')
  if (record.state !== 'READY') throw new Error('This A3.1 payload has already been submitted or attempted.')
  record.state = 'SUBMITTING'
  try {
    const result = await submitTransfer([{ burnIntent: record.burnIntent, signature: record.signature }])
    record.state = 'SUBMITTED'
    return result
  } catch (error) {
    record.state = 'FAILED_FINAL'
    throw error
  }
}

export function buildGatewayBurnIntent({ walletAddress, currentBlock, salt = `0x${randomBytes(32).toString('hex')}` }) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(walletAddress)) throw new Error('Expected an Arc Testnet SCA address.')
  if (typeof currentBlock !== 'bigint' || currentBlock < 0n) throw new Error('Expected a non-negative current block.')
  if (!/^0x[0-9a-fA-F]{64}$/.test(salt)) throw new Error('Expected a bytes32 salt.')

  const spec = {
    version: 1,
    sourceDomain: ARC_TESTNET.domain,
    destinationDomain: ARC_TESTNET.domain,
    sourceContract: addressToBytes32(ARC_TESTNET.gatewayWallet),
    destinationContract: addressToBytes32(ARC_TESTNET.gatewayMinter),
    sourceToken: addressToBytes32(ARC_TESTNET.usdc),
    destinationToken: addressToBytes32(ARC_TESTNET.usdc),
    sourceDepositor: addressToBytes32(walletAddress),
    destinationRecipient: addressToBytes32(walletAddress),
    sourceSigner: addressToBytes32(walletAddress),
    destinationCaller: addressToBytes32(zeroAddress),
    value: SPIKE_AMOUNT.toString(),
    salt,
    hookData: '0x',
  }
  const burnIntent = {
    maxBlockHeight: (currentBlock + SPIKE_BLOCK_WINDOW).toString(),
    maxFee: SPIKE_MAX_FEE.toString(),
    spec,
  }
  return {
    burnIntent,
    typedData: burnIntentTypedData(burnIntent),
  }
}

export class SignatureRequestRegistry {
  #requests = new Map()

  create(requestId, owner) {
    if (!requestId || this.#requests.has(requestId)) throw new Error('Duplicate signature request.')
    let resolve
    let reject
    const promise = new Promise((onResolve, onReject) => { resolve = onResolve; reject = onReject })
    this.#requests.set(requestId, { owner, challengeId: null, promise, resolve, reject })
    return promise
  }

  bindChallenge(requestId, challengeId) {
    const request = this.#requests.get(requestId)
    if (!request || request.challengeId) throw new Error('Unknown or already-bound signature request.')
    request.challengeId = challengeId
  }

  resolve(requestId, challengeId, owner, signature) {
    const request = this.#requests.get(requestId)
    if (!request || request.challengeId !== challengeId || request.owner !== owner) throw new Error('Signature correlation failed.')
    if (!/^0x[0-9a-fA-F]{130}$/.test(signature)) throw new Error('Circle signature must be 65-byte hex.')
    this.#requests.delete(requestId)
    request.resolve(signature)
  }

  cancel(requestId, reason = new Error('Signature request cancelled.')) {
    const request = this.#requests.get(requestId)
    if (!request) return
    this.#requests.delete(requestId)
    request.reject(reason)
  }
}
