import { W3SSdk } from '@circle-fin/w3s-pw-web-sdk'

const $ = (id) => document.getElementById(id)
const facts = $('facts')
const authStatus = $('auth-status')
const operationStatus = $('operation-status')
const sendOtpButton = $('send-otp')
const verifyOtpButton = $('verify-otp')
const approveButton = $('approve')
const payButton = $('pay')
const batchButton = $('batch')
const memoButton = $('memo')
const emailInput = $('email')

let sdk
let config
let deviceId
let auth
const operationState = { approve: null, pay: null, batch: null, memo: null }

function safeError(error) {
  return error instanceof Error ? error.message : String(error || 'Unknown error')
}

async function request(path, body) {
  const response = await fetch(path, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`)
  return data
}

function updateButtons() {
  sendOtpButton.disabled = !deviceId || !emailInput.value.trim()
  approveButton.disabled = !auth || Boolean(operationState.approve)
  payButton.disabled = !auth || BigInt(config?.allowance || '0') < BigInt(config?.expected.amount || '10000') || Boolean(operationState.pay)
  batchButton.disabled = !auth || Boolean(operationState.batch)
  memoButton.disabled = !auth || Boolean(operationState.memo)
}

async function recover(operation) {
  const challengeId = operationState[operation]?.challengeId
  if (!challengeId || !auth) return
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const state = await request('/prototype-api/recovery', { challengeId, userToken: auth.userToken })
    operationStatus.textContent = `${operation.toUpperCase()}\nchallengeId: ${state.challengeId}\nchallenge: ${state.challengeStatus}\ntransactionId: ${state.transactionId || 'pending'}\ntxHash: ${state.txHash || 'pending'}\nstate: ${state.state || 'pending'}`
    if (['COMPLETE', 'CONFIRMED', 'FAILED', 'CANCELLED', 'DENIED'].includes(String(state.state).toUpperCase())) {
      if (['approve', 'batch'].includes(operation) && ['COMPLETE', 'CONFIRMED'].includes(String(state.state).toUpperCase())) {
        config = await request('/prototype-api/config')
      }
      updateButtons()
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 3000))
  }
  operationStatus.textContent += '\nRecovery timed out; transaction remains submitted, not confirmed.'
}

async function createAndExecute(operation) {
  operationStatus.textContent = `Creating fixed ${operation} challenge…`
  try {
    const challenge = await request('/prototype-api/challenge', { operation, userToken: auth.userToken })
    operationState[operation] = challenge
    updateButtons()
    operationStatus.textContent = `${operation.toUpperCase()} challenge created\nchallengeId: ${challenge.challengeId}\nWaiting for user approval…`
    sdk.setAuthentication({ userToken: auth.userToken, encryptionKey: auth.encryptionKey })
    sdk.execute(challenge.challengeId, (error, result) => {
      if (error) {
        operationStatus.textContent = `${operation.toUpperCase()} approval error: ${safeError(error)}`
        return
      }
      operationStatus.textContent = `${operation.toUpperCase()} user approval result: ${result?.status || 'unknown'}\nRecovering Circle transaction ID and tx hash…`
      void recover(operation).catch((recoveryError) => { operationStatus.textContent += `\nRecovery error: ${safeError(recoveryError)}` })
    })
  } catch (error) {
    operationStatus.textContent = `${operation.toUpperCase()} challenge error: ${safeError(error)}`
  }
}

async function initialize() {
  config = await request('/prototype-api/config')
  if (!config?.arcMemo?.contract) throw new Error('Runner server is stale. Restart the local prototype runner.')
  const e = config.expected
  facts.textContent = `Network: Arc Testnet (${e.chainId})\nPayer: ${e.payer}\nRecipient: ${e.recipient}\nUSDC: ${e.usdc}\nPrototype V2: ${e.prototype}\nAmount: ${e.amount} base units\nReference: ${e.paymentReference}\nMemo: ${e.memo}\nCurrent allowance: ${config.allowance}`
  const memo = config.arcMemo
  $('memo-facts').textContent = `Memo contract: ${memo.contract}\nTarget: ${memo.usdc}\nRecipient: ${memo.recipient}\nAmount: ${memo.amount} base units\nMemo ID: ${memo.memoId}\nMemo plaintext: ${memo.memoText}\nInner call hash: ${memo.transferCallDataHash}`

  const onLoginComplete = (error, result) => {
    if (error) {
      authStatus.textContent = `Circle login failed: ${safeError(error)}`
      return
    }
    if (!result?.userToken || !result?.encryptionKey) {
      authStatus.textContent = 'Circle login response is incomplete.'
      return
    }
    auth = { userToken: result.userToken, encryptionKey: result.encryptionKey }
    authStatus.textContent = 'Circle authentication ready. Credentials remain in browser memory only.'
    updateButtons()
  }

  sdk = new W3SSdk({ appSettings: { appId: config.appId } }, onLoginComplete)
  sdk.updateConfigs({ appSettings: { appId: config.appId } }, onLoginComplete)
  deviceId = await sdk.getDeviceId()
  authStatus.textContent = 'Circle SDK ready. Enter the payer account email.'
  updateButtons()
}

sendOtpButton.addEventListener('click', async () => {
  sendOtpButton.disabled = true
  authStatus.textContent = 'Requesting Circle email OTP…'
  try {
    const tokens = await request('/prototype-api/otp', { email: emailInput.value.trim(), deviceId })
    sdk.updateConfigs({
      appSettings: { appId: config.appId },
      loginConfigs: { deviceToken: tokens.deviceToken, deviceEncryptionKey: tokens.deviceEncryptionKey, otpToken: tokens.otpToken },
    })
    verifyOtpButton.disabled = false
    authStatus.textContent = 'OTP sent. Open Circle verification and enter the code yourself.'
  } catch (error) {
    authStatus.textContent = `OTP request failed: ${safeError(error)}`
    updateButtons()
  }
})

verifyOtpButton.addEventListener('click', () => {
  verifyOtpButton.disabled = true
  authStatus.textContent = 'Circle OTP verification opened. Complete it in the Circle dialog.'
  sdk.verifyOtp()
})
approveButton.addEventListener('click', () => void createAndExecute('approve'))
payButton.addEventListener('click', () => void createAndExecute('pay'))
batchButton.addEventListener('click', () => void createAndExecute('batch'))
memoButton.addEventListener('click', () => void createAndExecute('memo'))
emailInput.addEventListener('input', updateButtons)

initialize().catch((error) => {
  authStatus.textContent = `Runner initialization failed: ${safeError(error)}`
})
