import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
const client = readFileSync(new URL('../src/walletconnect-invoice.ts', import.meta.url), 'utf8')
const api = readFileSync(new URL('../api/invoice-payment-intent.ts', import.meta.url), 'utf8')
const verifyApi = readFileSync(new URL('../api/invoice-payment-verify.ts', import.meta.url), 'utf8')
const sql = readFileSync(new URL('../supabase/migrations/202609080002_invoice_payment_intents.sql', import.meta.url), 'utf8')

test('creates an intent from the exact invoice and snapshots the immutable target', () => {
  assert.match(client, /JSON\.stringify\(\{ action: 'create', invoiceId \}\)/)
  assert.match(api, /invoice_id: invoice\.id/)
  assert.match(api, /receiving_wallet_address: invoice\.receiving_wallet_address\.toLowerCase\(\)/)
  assert.match(api, /amount: invoice\.amount/)
  assert.match(api, /asset: invoice\.asset/)
  assert.match(api, /chain_id: invoicePaymentChainId/)
  assert.match(api, /expires_at: invoice\.expires_at/)
})

test('WalletConnect request uses the snapshot and binds its returned hash to that intent', () => {
  assert.match(client, /EthereumProvider\.init/)
  assert.match(client, /chains: \[arcTestnet\.id\]/)
  assert.match(client, /submitExternalUsdcPayment\(arcProvider, connected\.address, input\.intent\.recipientAddress, input\.intent\.amount\)/)
  assert.match(client, /JSON\.stringify\(\{ action: 'bind', intentId: intent\.id, token: intent\.token, txHash \}\)/)
  assert.match(client, /balance\.raw < externalUsdcAmount\(input\.intent\.amount\)/)
  assert.match(client, /createPublicClient\(\{ chain: arcTestnet,[\s\S]+readContract\([\s\S]+address: arcTestnetUsdcAddress[\s\S]+name: 'balanceOf'/)
})

test('Scan opens WalletConnect without requiring an injected browser wallet or dropping a valid session', () => {
  const connectStart = client.indexOf('export async function connectInvoiceWalletConnect')
  const submitStart = client.indexOf('export async function submitWalletConnectIntent')
  const connectFlow = client.slice(connectStart, submitStart)
  assert.doesNotMatch(connectFlow, /window\.ethereum/)
  assert.doesNotMatch(connectFlow, /provider\.disconnect/)
  assert.match(connectFlow, /if \(!provider\.connected\) await provider\.connect\(\)/)
  assert.match(connectFlow, /showQrModal: true/)
})

test('Scan checks and switches Arc only after the WalletConnect session exists', () => {
  const connectCall = client.indexOf('await provider.connect()')
  const submitStart = client.indexOf('export async function submitWalletConnectIntent')
  const chainRead = client.indexOf('readWalletConnectChain(provider, input.intent.chainId)', submitStart)
  const switchCall = client.indexOf('switchWalletConnectToArc(provider)', submitStart)
  assert.ok(connectCall > -1 && submitStart > connectCall && chainRead > submitStart && switchCall > chainRead)
  assert.match(client, /wallet_switchEthereumChain/)
  assert.match(client, /wallet_addEthereumChain/)
})

test('connected WalletConnect session already on Arc continues without a switch request', () => {
  const submitStart = client.indexOf('export async function submitWalletConnectIntent')
  const submitFlow = client.slice(submitStart)
  assert.match(submitFlow, /if \(chainBeforeSwitch !== input\.intent\.chainId\) \{\s+await switchWalletConnectToArc/)
})

test('wrong-chain WalletConnect session switches to Arc through the same provider', () => {
  assert.match(client, /switchWalletConnectToArc\(provider\)/)
  assert.match(client, /wallet_switchEthereumChain'[\s\S]+chainId: arcTestnetChainIdHex/)
  assert.match(readFileSync(new URL('../src/external-wallet.ts', import.meta.url), 'utf8'), /arcTestnetChainIdHex = `0x\$\{arcTestnet\.id\.toString\(16\)\}`/)
})

test('normalizes WalletConnect hex, decimal, and CAIP-2 chain IDs before comparison', () => {
  assert.match(client, /normalized\.startsWith\('eip155:'\)/)
  assert.match(client, /Number\.parseInt\(chain\.slice\(2\), 16\)/)
  assert.match(client, /Number\.parseInt\(chain, 10\)/)
})

test('post-switch state waits for chainChanged, session_update, or a provider re-read', () => {
  assert.match(client, /provider\.on\?\.\('chainChanged'/)
  assert.match(client, /provider\.on\?\.\('session_update'/)
  assert.match(client, /setInterval\(check, 300\)/)
  assert.match(client, /waitForWalletConnectChain\(provider, input\.intent\.chainId\)/)
})

test('unknown Arc chain from WalletConnect is added and then switched', () => {
  assert.match(client, /walletErrorCode\(error\) !== 4902/)
  assert.match(client, /wallet_addEthereumChain'[\s\S]+chainName: arcTestnet\.name[\s\S]+rpcUrls: \[arcTestnet\.rpcUrls\.default\.http\[0\]\][\s\S]+blockExplorerUrls/)
  assert.match(client, /wallet_addEthereumChain'[\s\S]+await switchChain\(\)/)
})

test('WalletConnect switch rejection is clear and does not disconnect the session', () => {
  assert.match(client, /walletErrorCode\(error\) === 4001[\s\S]+network switch was rejected/)
  assert.match(client, /Adding or switching to Arc Testnet was rejected/)
  const switchStart = client.indexOf('export async function switchWalletConnectToArc')
  const submitStart = client.indexOf('export async function submitWalletConnectIntent')
  assert.doesNotMatch(client.slice(switchStart, submitStart), /disconnect/)
})

test('migration rejects expired or wrong intent and enforces transaction uniqueness', () => {
  assert.match(sql, /invoice_id uuid not null references public\.invoices/)
  assert.match(sql, /chain_id bigint not null check \(chain_id = 5042002\)/)
  assert.match(sql, /unique index[\s\S]+\(tx_hash\) where tx_hash is not null/)
  assert.match(sql, /target\.expires_at <= now\(\)[\s\S]+target_invoice\.expires_at <= now\(\)/)
  assert.match(sql, /target\.tx_hash is not null and target\.tx_hash <> p_tx_hash/)
  assert.match(sql, /exception when unique_violation[\s\S]+tx_reused/)
  assert.match(sql, /lower\(target\.receiving_wallet_address\)[\s\S]+target\.amount <> target_invoice\.amount[\s\S]+target\.asset <> target_invoice\.asset/)
  assert.match(sql, /revoke all on function public\.bind_invoice_payment_intent_tx[\s\S]+grant execute[\s\S]+service_role/)
})

test('happy path auto-verifies and has no hash input or Verify payment button', () => {
  const start = app.indexOf('const prepareScanPayment')
  const end = app.indexOf('const connectInvoiceWallet', start)
  const flow = app.slice(start, end)
  assert.match(flow, /createInvoicePaymentIntent\(invoiceId\)/)
  assert.match(flow, /connectInvoiceWalletConnect/)
  assert.match(flow, /submitWalletConnectIntent/)
  assert.match(flow, /autoVerifyInvoicePayment\(\{ invoiceId, txHash: submitted\.txHash, intentId: intent\.id, intentToken: intent\.token \}\)/)
  assert.match(flow, /await loadInvoice\(\)/)
  const uiStart = app.indexOf("paymentOption === 'scan'")
  const uiEnd = app.indexOf('\n                  ) : null}', uiStart)
  const ui = app.slice(uiStart, uiEnd)
  assert.match(ui, /Scan the WalletConnect QR/)
  assert.match(ui, /Confirming payment/)
  assert.doesNotMatch(ui, /Transaction hash|Verify payment|scan-payment-tx-hash/)
})

test('strict verifier accepts an intent only after its exact hash is bound', () => {
  assert.match(verifyApi, /Payment intent credentials are required\./)
  assert.match(verifyApi, /eq\('invoice_id', invoiceId\).*eq\('public_token_hash', publicTokenHash\).*eq\('tx_hash', txHash\)/)
  assert.match(verifyApi, /verifyInvoicePaymentReceipt/)
  assert.match(verifyApi, /supabase\.rpc\('mark_verified_invoice_paid'/)
  assert.match(verifyApi, /status: retryableVerification\.has\(verified\.reason\) \? 'confirming' : 'failed'/)
})

test('raw invoice ID and arbitrary hash cannot bypass intent correlation', () => {
  const credentials = verifyApi.indexOf('Payment intent credentials are required.')
  const invoiceRead = verifyApi.indexOf("from('invoices')")
  const chainRead = verifyApi.indexOf("rpc('eth_chainId')")
  assert.ok(credentials > -1 && credentials < invoiceRead && credentials < chainRead)
  assert.doesNotMatch(verifyApi, /if \(intentId \|\| intentToken\)/)
})
