import { W3SSdk } from '@circle-fin/w3s-pw-web-sdk'

const $ = (id) => document.getElementById(id)
let sdk
let config
let deviceId
let auth
let signing = false
let a2Discovery
let gatewayState
let gatewayBusy = false
let a3Busy = false
let a3SignedRequestId
let a3SubmitBusy = false
let a3Submitted = false
let eoaProvisionBusy = false
let a4EstimateBusy = false
let a4Operation
let a4SpendBusy = false
const handledA4Challenges = new Set()

function safeError(error) { return error instanceof Error ? error.message : String(error || 'Unknown error') }
async function request(path, body) {
  const response = await fetch(path, { method: body ? 'POST' : 'GET', headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`)
  return data
}
function updateButtons() {
  $('a4-estimate').disabled = !auth || a4EstimateBusy || !a2Discovery?.polygonWallet
  $('a4-spend').disabled = !auth || a4SpendBusy || a4Operation?.state !== 'READY'
  $('send-otp').disabled = !deviceId || !$('email').value.trim()
  $('sign').disabled = !auth || signing
  $('a2-preflight').disabled = !auth
  $('a2-provision').disabled = !auth || !a2Discovery || Boolean(a2Discovery.polygonWallet)
  $('a3-eoa-provision').disabled = !auth || eoaProvisionBusy || !a2Discovery?.polygonWallet || Boolean(a2Discovery?.polygonEoa)
  $('a2-gateway-refresh').disabled = !auth || gatewayBusy
  const allowanceReady = gatewayState && BigInt(gatewayState.walletState.allowanceBaseUnits) >= 2000000n
  $('a2-gateway-approve').disabled = !auth || gatewayBusy || !gatewayState
  $('a2-gateway-deposit').disabled = !auth || gatewayBusy || !allowanceReady
  $('a3-prepare').disabled = !auth || a3Busy
  $('a3-submit').disabled = !auth || !a3SignedRequestId || a3SubmitBusy || a3Submitted
}

function renderA2(result) {
  const arc = result.arcWallet
  const polygon = result.polygonWallet
  $('a2-status').textContent = `ARC-TESTNET\nwallet ID: ${arc.id}\naddress: ${arc.address}\naccountType: ${arc.accountType}\naddress match: YES\n\nMATIC-AMOY\nfound: ${polygon ? 'YES' : 'NO'}${polygon ? `\nwallet ID: ${polygon.id}\naddress: ${polygon.address}\naccountType: ${polygon.accountType}\nblockchain: ${polygon.blockchain}\nbytecode detected: ${result.polygon.bytecodeDetected ? 'YES' : 'NO'}\nnative POL (wei): ${result.polygon.nativePolWei}\nUSDC (base units): ${result.polygon.usdcBaseUnits}` : ''}\n\nState-changing calls performed by discovery: NO`
  const eoa = result.polygonEoa
  $('a3-eoa-status').textContent = eoa
    ? `MATIC-AMOY EOA ${result.polygonEoaState?.bytecodeEmpty ? 'VERIFIED' : 'INVALID'}\nwallet ID: ${eoa.id}\naddress: ${eoa.address}\naccountType: ${eoa.accountType}\nblockchain: ${eoa.blockchain}\neth_getCode: ${result.polygonEoaState?.bytecode}\nEOA bytecode check: ${result.polygonEoaState?.bytecodeEmpty ? 'PASS' : 'FAIL'}\nHard stop: no delegate permission granted.`
    : 'MATIC-AMOY EOA found: NO. Manual provisioning is available after exact SCA correlation.'
}

function renderGatewayState(result, prefix = '') {
  gatewayState = result
  const state = result.walletState
  $('a2-gateway-status').textContent = `${prefix}${prefix ? '\n' : ''}Polygon wallet: ${result.wallet.address}\nSCA bytecode detected: ${state.bytecodeDetected ? 'YES' : 'NO'}\nUSDC (base units): ${state.usdcBaseUnits}\nPOL (wei): ${state.nativePolWei}\nGateway allowance (base units): ${state.allowanceBaseUnits}\nGateway balance (base units): ${state.gatewayBalanceBaseUnits}\nGateway pending batch: ${state.gatewayPendingBatchBaseUnits}`
  updateButtons()
}

async function refreshGatewayState() {
  const result = await request('/gateway-a1-api/a2-gateway-state', { userToken: auth.userToken })
  renderGatewayState(result)
  return result
}

async function pollGatewayRecovery(challengeId) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const result = await request('/gateway-a1-api/a2-gateway-recovery', { userToken: auth.userToken, challengeId })
    const prefix = `${result.operation.toUpperCase()}\nchallengeId: ${result.challengeId}\nchallenge: ${result.challengeStatus}\ntransactionId: ${result.transactionId || 'pending'}\ntxHash: ${result.txHash || 'pending'}\nCircle state: ${result.circleState || 'pending'}\nreceipt: ${result.receiptStatus || 'pending'}\nstate: ${result.state}`
    if (result.wallet) renderGatewayState(result, prefix)
    else $('a2-gateway-status').textContent = prefix
    if (result.state === 'CONFIRMED') return result
    if (result.state === 'FAILED') throw new Error(`${result.operation} transaction failed.`)
    await new Promise((resolve) => setTimeout(resolve, 3000))
  }
  throw new Error('Timed out waiting for the Polygon transaction receipt.')
}

async function runGatewayOperation(operation) {
  gatewayBusy = true
  updateButtons()
  $('a2-gateway-status').textContent = `Creating exact ${operation} Circle challenge…`
  try {
    const created = await request('/gateway-a1-api/a2-gateway-challenge', { userToken: auth.userToken, operation })
    $('a2-gateway-status').textContent = `${operation.toUpperCase()} challenge created\nchallengeId: ${created.challengeId}\nWaiting for your approval…`
    sdk.setAuthentication({ userToken: auth.userToken, encryptionKey: auth.encryptionKey })
    await new Promise((resolve, reject) => sdk.execute(created.challengeId, (error, result) => {
      if (error) return reject(error)
      if (!result) return reject(new Error('Circle transaction challenge returned no result.'))
      resolve(result)
    }))
    await pollGatewayRecovery(created.challengeId)
  } catch (error) {
    $('a2-gateway-status').textContent += `\nFAILED: ${safeError(error)}\nNo later Gateway operation was started.`
  } finally {
    gatewayBusy = false
    updateButtons()
  }
}

async function readNdjson(response, onEvent) {
  if (!response.ok || !response.body) throw new Error(`Signing request failed (${response.status}).`)
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let pending = ''
  while (true) {
    const { value, done } = await reader.read()
    pending += decoder.decode(value || new Uint8Array(), { stream: !done })
    const lines = pending.split('\n')
    pending = lines.pop() || ''
    for (const line of lines) if (line.trim()) await onEvent(JSON.parse(line))
    if (done) break
  }
}

async function startSigning() {
  signing = true
  updateButtons()
  $('sign-status').textContent = 'Building a test BurnIntent with the authenticated Arc Testnet SCA…'
  try {
    const response = await fetch('/gateway-a1-api/sign', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userToken: auth.userToken }) })
    await readNdjson(response, async (event) => {
      if (event.type === 'prepared') {
        const spec = event.burnIntent.spec
        $('sign-status').textContent = `BurnIntent prepared\nrequestId: ${event.requestId}\nsourceDepositor: ${spec.sourceDepositor}\nsourceSigner: ${spec.sourceSigner}\ndestinationRecipient: ${spec.destinationRecipient}\nsource/destination domain: ${spec.sourceDomain}/${spec.destinationDomain}\namount: ${spec.value}\nmaxFee: ${event.burnIntent.maxFee}\nmaxBlockHeight: ${event.burnIntent.maxBlockHeight}\ndestinationCaller: ${spec.destinationCaller}\nsalt: ${spec.salt}\nSCA bytecode detected: ${event.bytecodeDetected ? 'YES' : 'NO'}`
      } else if (event.type === 'challenge') {
        $('sign-status').textContent += `\nSIGN_TYPEDDATA challenge: ${event.challengeId}\nWaiting for your approval…`
        sdk.setAuthentication({ userToken: auth.userToken, encryptionKey: auth.encryptionKey })
        await new Promise((resolve, reject) => sdk.execute(event.challengeId, async (error, result) => {
          if (error) return reject(error)
          const signature = result?.data?.signature
          if (typeof signature !== 'string') return reject(new Error('Approved challenge did not return a signature.'))
          try {
            await request('/gateway-a1-api/resolve', { userToken: auth.userToken, requestId: event.requestId, challengeId: event.challengeId, signature })
            $('sign-status').textContent += '\nUser approval completed; signature returned to correlated server request.'
            resolve()
          } catch (resolveError) { reject(resolveError) }
        }))
      } else if (event.type === 'completed') {
        $('sign-status').textContent += `\nSigning completed\nsigner address: ${event.signerAddress}\nSCA bytecode detected: ${event.bytecodeDetected ? 'YES' : 'NO'}\ncontractSigner: ${String(event.contractSigner)}\nsignature obtained: ${event.signatureObtained ? 'YES' : 'NO'}\nGateway /v1/transfer submitted: NO`
      } else if (event.type === 'failed') {
        throw new Error(event.error)
      }
    })
  } catch (error) {
    $('sign-status').textContent += `\nFAILED: ${safeError(error)}`
  } finally {
    signing = false
    updateButtons()
  }
}

async function startA3Prepare() {
  a3Busy = true
  a3SignedRequestId = undefined
  a3Submitted = false
  updateButtons()
  $('a3-status').textContent = 'Checking exact wallets and live Gateway available balance…'
  try {
    const response = await fetch('/gateway-a1-api/a3-prepare', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userToken: auth.userToken }) })
    await readNdjson(response, async (event) => {
      if (event.type === 'prepared') {
        const spec = event.burnIntent.spec
        $('a3-status').textContent = `A3.1 BurnIntent prepared from Gateway estimate\nGateway balance before: ${event.gatewayBalanceBefore}\namount: ${spec.value}\nsource: Polygon Amoy / domain ${spec.sourceDomain}\nsourceDepositor: ${spec.sourceDepositor}\nsourceSigner: ${spec.sourceSigner}\ndestination: Arc Testnet / domain ${spec.destinationDomain}\ndestinationRecipient: ${spec.destinationRecipient}\nmaxFee: ${event.burnIntent.maxFee}\nmaxBlockHeight: ${event.burnIntent.maxBlockHeight}\nGateway /v1/transfer submitted: NO`
      } else if (event.type === 'challenge') {
        $('a3-status').textContent += `\nSIGN_TYPEDDATA challenge: ${event.challengeId}\nWaiting for your approval…`
        sdk.setAuthentication({ userToken: auth.userToken, encryptionKey: auth.encryptionKey })
        await new Promise((resolve, reject) => sdk.execute(event.challengeId, async (error, result) => {
          if (error) return reject(error)
          const signature = result?.data?.signature
          if (typeof signature !== 'string') return reject(new Error('Approved challenge did not return a signature.'))
          try {
            await request('/gateway-a1-api/resolve', { userToken: auth.userToken, requestId: event.requestId, challengeId: event.challengeId, signature })
            resolve()
          } catch (resolveError) { reject(resolveError) }
        }))
      } else if (event.type === 'completed') {
        const preview = event.preview
        a3SignedRequestId = event.requestId
        $('a3-status').textContent += `\nA3.1 SIGNING COMPLETE\ncontractSigner: ${String(preview.contractSigner)}\nsignature obtained: ${preview.signatureObtained ? 'YES' : 'NO'}\nArc USDC before: ${event.arcBalanceBefore}\nendpoint that WOULD be called: ${preview.endpoint}\npayload preview:\n${JSON.stringify(preview.requestBody, null, 2)}\nGateway /v1/transfer submitted: NO`
        updateButtons()
      } else if (event.type === 'failed') {
        if (event.diagnostic) {
          const diagnostic = event.diagnostic
          $('a3-status').textContent += `\nstage: ${diagnostic.stage}\nurl: ${diagnostic.url}\nerror.name: ${diagnostic.error?.name}\nerror.message: ${diagnostic.error?.message}\ncause.code: ${diagnostic.cause?.code}\ncause.errno: ${diagnostic.cause?.errno}\ncause.syscall: ${diagnostic.cause?.syscall}\ncause.hostname: ${diagnostic.cause?.hostname}\ncause.message: ${diagnostic.cause?.message}`
        }
        throw new Error(event.error)
      }
    })
  } catch (error) {
    $('a3-status').textContent += `\nFAILED: ${safeError(error)}\nGateway /v1/transfer submitted: NO`
  } finally {
    a3Busy = false
    updateButtons()
  }
}

async function submitA3Transfer() {
  a3SubmitBusy = true
  a3Submitted = true
  updateButtons()
  $('a3-submit-status').textContent = 'Submitting the exact signed A3.1 payload once…'
  try {
    const response = await fetch('/gateway-a1-api/a3-submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userToken: auth.userToken, requestId: a3SignedRequestId }),
    })
    const submitted = await response.json()
    $('a3-submit-status').textContent = `Gateway submission accepted: ${submitted.accepted ? 'YES' : 'NO'}\nHTTP status: ${submitted.httpStatus}\ntransferId: ${submitted.transferId || 'none'}\nresponse: ${JSON.stringify(submitted.response, null, 2)}\nArc USDC before/current: ${submitted.arcBalanceBefore}/${submitted.arcBalanceCurrent}\nPayload submitted exactly once: YES`
    if (!response.ok || !submitted.accepted) {
      $('a3-submit-status').textContent += '\nGateway rejected the direct SCA payload. No retry or fallback was attempted.'
      return
    }
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const current = await request('/gateway-a1-api/a3-status', { userToken: auth.userToken, requestId: a3SignedRequestId })
      $('a3-submit-status').textContent += `\n\nStatus check ${attempt + 1}:\n${JSON.stringify(current, null, 2)}`
      if (['confirmed', 'finalized', 'failed', 'expired'].includes(current.status?.status)) break
      await new Promise((resolve) => setTimeout(resolve, 3000))
    }
  } catch (error) {
    $('a3-submit-status').textContent += `\nFAILED: ${safeError(error)}\nNo retry or fallback was attempted.`
  } finally {
    a3SubmitBusy = false
    updateButtons()
  }
}

async function initialize() {
  config = await request('/gateway-a1-api/config')
  $('facts').textContent = `Network: ${config.network}\nChain ID: ${config.chainId}\nA3.2: /v1/transfer runs only after the explicit one-shot submit action; no automatic gatewayMint`
  const onLoginComplete = (error, result) => {
    if (error) return void ($('auth-status').textContent = `Circle login failed: ${safeError(error)}`)
    if (!result?.userToken || !result?.encryptionKey) return void ($('auth-status').textContent = 'Circle login response is incomplete.')
    auth = { userToken: result.userToken, encryptionKey: result.encryptionKey }
    a2Discovery = undefined
    gatewayState = undefined
    a3SignedRequestId = undefined
    a3Submitted = false
    eoaProvisionBusy = false
    $('a3-eoa-status').textContent = 'Authenticate and run wallet discovery first.'
    $('auth-status').textContent = 'Circle authentication ready. Credentials remain in browser memory only.'
    updateButtons()
  }
  sdk = new W3SSdk({ appSettings: { appId: config.appId } }, onLoginComplete)
  sdk.updateConfigs({ appSettings: { appId: config.appId } }, onLoginComplete)
  deviceId = await sdk.getDeviceId()
  $('auth-status').textContent = 'Circle SDK ready. Enter the account email.'
  updateButtons()
}

$('email').addEventListener('input', updateButtons)
$('send-otp').addEventListener('click', async () => {
  $('send-otp').disabled = true
  $('auth-status').textContent = 'Requesting Circle email OTP…'
  try {
    const tokens = await request('/gateway-a1-api/otp', { email: $('email').value.trim(), deviceId })
    sdk.updateConfigs({ appSettings: { appId: config.appId }, loginConfigs: { deviceToken: tokens.deviceToken, deviceEncryptionKey: tokens.deviceEncryptionKey, otpToken: tokens.otpToken } })
    $('verify-otp').disabled = false
    $('auth-status').textContent = 'OTP sent. Open verification and enter the code yourself.'
  } catch (error) { $('auth-status').textContent = `OTP request failed: ${safeError(error)}`; updateButtons() }
})
$('verify-otp').addEventListener('click', () => { $('verify-otp').disabled = true; sdk.verifyOtp() })
$('sign').addEventListener('click', () => void startSigning())
$('a2-preflight').addEventListener('click', async () => {
  $('a2-preflight').disabled = true
  $('a2-status').textContent = 'Listing wallets for the authenticated Circle user…'
  try {
    const result = await request('/gateway-a1-api/a2-preflight', { userToken: auth.userToken })
    a2Discovery = result
    renderA2(result)
  } catch (error) {
    $('a2-status').textContent = `A2 PREFLIGHT FAILED: ${safeError(error)}`
  } finally {
    updateButtons()
  }
})
$('a2-provision').addEventListener('click', async () => {
  $('a2-provision').disabled = true
  $('a2-provision-status').textContent = 'Requesting one MATIC-AMOY SCA creation challenge…'
  try {
    const { challengeId } = await request('/gateway-a1-api/a2-provision', { userToken: auth.userToken })
    $('a2-provision-status').textContent = `Challenge created: ${challengeId}\nWaiting for your approval…`
    sdk.setAuthentication({ userToken: auth.userToken, encryptionKey: auth.encryptionKey })
    await new Promise((resolve, reject) => sdk.execute(challengeId, (error, result) => {
      if (error) return reject(error)
      if (!result) return reject(new Error('Circle wallet creation challenge returned no result.'))
      resolve(result)
    }))
    $('a2-provision-status').textContent += '\nChallenge completed. Waiting for Circle wallet discovery…'
    let discovered
    for (let attempt = 0; attempt < 15; attempt += 1) {
      discovered = await request('/gateway-a1-api/a2-preflight', { userToken: auth.userToken })
      if (discovered.polygonWallet) break
      await new Promise((resolve) => setTimeout(resolve, 2000))
    }
    if (!discovered?.polygonWallet) throw new Error('Challenge completed, but MATIC-AMOY wallet is not visible yet. Run discovery again.')
    a2Discovery = discovered
    renderA2(discovered)
    $('a2-provision-status').textContent += `\nMATIC-AMOY wallet verified: ${discovered.polygonWallet.address}\nFunding or Gateway calls performed: NO`
  } catch (error) {
    $('a2-provision-status').textContent += `\nFAILED: ${safeError(error)}`
  } finally {
    updateButtons()
  }
})
$('a3-eoa-provision').addEventListener('click', async () => {
  eoaProvisionBusy = true
  updateButtons()
  $('a3-eoa-status').textContent = 'Requesting one MATIC-AMOY EOA creation challenge…'
  try {
    const { challengeId } = await request('/gateway-a1-api/a3-eoa-provision', { userToken: auth.userToken })
    $('a3-eoa-status').textContent = `EOA challenge created: ${challengeId}\nWaiting for your approval…`
    sdk.setAuthentication({ userToken: auth.userToken, encryptionKey: auth.encryptionKey })
    await new Promise((resolve, reject) => sdk.execute(challengeId, (error, result) => {
      if (error) return reject(error)
      if (!result) return reject(new Error('Circle EOA creation challenge returned no result.'))
      resolve(result)
    }))
    let discovered
    for (let attempt = 0; attempt < 15; attempt += 1) {
      discovered = await request('/gateway-a1-api/a2-preflight', { userToken: auth.userToken })
      if (discovered.polygonEoa) break
      await new Promise((resolve) => setTimeout(resolve, 2000))
    }
    if (!discovered?.polygonEoa) throw new Error('Challenge completed, but MATIC-AMOY EOA is not visible yet. Run discovery again.')
    if (!discovered.polygonEoaState?.bytecodeEmpty) throw new Error('Circle returned an EOA record whose address has contract bytecode.')
    a2Discovery = discovered
    renderA2(discovered)
  } catch (error) {
    $('a3-eoa-status').textContent += `\nFAILED: ${safeError(error)}\nNo delegate, signing, estimate, or transfer action was started.`
  } finally {
    eoaProvisionBusy = false
    updateButtons()
  }
})
$('a2-gateway-refresh').addEventListener('click', async () => {
  gatewayBusy = true; updateButtons()
  try { await refreshGatewayState() } catch (error) { $('a2-gateway-status').textContent = `A2.3 STATE FAILED: ${safeError(error)}` }
  finally { gatewayBusy = false; updateButtons() }
})
$('a2-gateway-approve').addEventListener('click', () => void runGatewayOperation('approve'))
$('a2-gateway-deposit').addEventListener('click', () => void runGatewayOperation('deposit'))
$('a3-prepare').addEventListener('click', () => void startA3Prepare())
$('a3-submit').addEventListener('click', () => void submitA3Transfer())
$('a4-estimate').addEventListener('click', async () => {
  a4EstimateBusy = true
  updateButtons()
  $('a4-status').textContent = 'Rechecking exact SCA wallets, Polygon bytecode, live Gateway and Arc balances; estimating only…'
  try {
    const result = await request('/gateway-a1-api/a4-estimate', { userToken: auth.userToken })
    a4Operation = result
    $('a4-status').textContent = JSON.stringify(result, null, 2)
  } catch (error) {
    $('a4-status').textContent = `A4.2a FAILED: ${safeError(error)}\nSpend disabled. Gateway /v1/transfer submitted: NO`
  } finally {
    a4EstimateBusy = false
    updateButtons()
  }
})

async function executeA4Challenge(challenge) {
  if (handledA4Challenges.has(challenge.challengeId)) return
  handledA4Challenges.add(challenge.challengeId)
  sdk.setAuthentication({ userToken: auth.userToken, encryptionKey: auth.encryptionKey })
  try {
    const result = await new Promise((resolve, reject) => sdk.execute(challenge.challengeId, (error, value) => error ? reject(error) : resolve(value)))
    const signature = result?.data?.signature
    await request('/gateway-a1-api/a4-challenge-result', {
      userToken: auth.userToken, operationId: a4Operation.operationId, challengeId: challenge.challengeId,
      ...(typeof signature === 'string' ? { signature } : {}),
    })
  } catch (error) {
    await request('/gateway-a1-api/a4-challenge-result', { userToken: auth.userToken, operationId: a4Operation.operationId, challengeId: challenge.challengeId, rejected: true }).catch(() => {})
    $('a4-status').textContent = `Circle approval stopped: ${safeError(error)}\nWaiting for the locked operation to reach its terminal state…`
  }
}

async function pollA4Spend() {
  while (a4Operation && !['COMPLETED', 'FAILED', 'UNKNOWN'].includes(a4Operation.state)) {
    a4Operation = await request('/gateway-a1-api/a4-status', { userToken: auth.userToken, operationId: a4Operation.operationId })
    $('a4-status').textContent = JSON.stringify(a4Operation, null, 2)
    const challenge = a4Operation.challenges?.find((item) => !handledA4Challenges.has(item.challengeId))
    if (challenge) await executeA4Challenge(challenge)
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  $('a4-status').textContent = JSON.stringify(a4Operation, null, 2)
  updateButtons()
}

$('a4-spend').addEventListener('click', async () => {
  a4SpendBusy = true
  updateButtons()
  try {
    a4Operation = await request('/gateway-a1-api/a4-spend', { userToken: auth.userToken, operationId: a4Operation.operationId })
    await pollA4Spend()
  } catch (error) {
    $('a4-status').textContent = `A4.2b stopped: ${safeError(error)}\nNo application-level retry is available.`
  } finally {
    a4SpendBusy = false
    updateButtons()
  }
})

initialize().catch((error) => { $('auth-status').textContent = `Initialization failed: ${safeError(error)}` })
