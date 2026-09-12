import { createPublicClient, decodeEventLog, encodeFunctionData, formatUnits, http, isAddress, keccak256, parseUnits, stringToHex } from 'viem'
import { arcTestnet } from 'viem/chains'

const usdcAddress = '0x3600000000000000000000000000000000000000'
const transferTopic = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
const args = Object.fromEntries(process.argv.slice(2).map((entry) => {
  const separator = entry.indexOf('=')
  return separator < 0 ? [entry.replace(/^--/, ''), ''] : [entry.slice(0, separator).replace(/^--/, ''), entry.slice(separator + 1)]
}))
const required = (name) => {
  const value = args[name]
  if (!value) throw new Error(`Missing --${name}=...`)
  return value
}

const txHash = required('tx')
const prototypeAddress = required('prototype')
const payer = required('payer')
const recipient = required('recipient')
const amount = required('amount')
const reference = required('reference')
const memo = args.memo ?? 'Thanks Miley'
if (!/^0x[0-9a-fA-F]{64}$/.test(txHash) || ![prototypeAddress, payer, recipient].every(isAddress)) throw new Error('Invalid transaction or address argument.')
if (Buffer.byteLength(reference, 'utf8') < 1 || Buffer.byteLength(reference, 'utf8') > 32) throw new Error('Reference must be 1-32 UTF-8 bytes.')
if (Buffer.byteLength(memo, 'utf8') > 64) throw new Error('Memo must be at most 64 UTF-8 bytes.')

const client = createPublicClient({ chain: arcTestnet, transport: http(process.env.ARC_RPC_URL || arcTestnet.rpcUrls.default.http[0]) })
const amountUnits = parseUnits(amount, 6)
const eventAbi = [{ type: 'event', name: 'InvoicePayment', inputs: [
  { indexed: true, name: 'referenceHash', type: 'bytes32' }, { indexed: true, name: 'payer', type: 'address' }, { indexed: true, name: 'recipient', type: 'address' },
  { indexed: false, name: 'token', type: 'address' }, { indexed: false, name: 'amount', type: 'uint256' }, { indexed: false, name: 'paymentReference', type: 'string' }, { indexed: false, name: 'memo', type: 'string' },
] }]
const balanceAbi = [{ type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] }]

const receipt = await client.getTransactionReceipt({ hash: txHash })
const referenceHash = keccak256(stringToHex(reference))
const addressTopic = (address) => `0x${address.toLowerCase().slice(2).padStart(64, '0')}`
const transferLogs = receipt.logs.filter((log) => log.address.toLowerCase() === usdcAddress && log.topics[0]?.toLowerCase() === transferTopic)
const exactTransfer = transferLogs.find((log) => log.topics[1]?.toLowerCase() === addressTopic(payer) && log.topics[2]?.toLowerCase() === addressTopic(recipient) && BigInt(log.data) === amountUnits)
const decodedEvents = receipt.logs.filter((log) => log.address.toLowerCase() === prototypeAddress.toLowerCase()).flatMap((log) => {
  try { return [decodeEventLog({ abi: eventAbi, data: log.data, topics: log.topics })] } catch { return [] }
})
const exactEvent = decodedEvents.find((event) => event.eventName === 'InvoicePayment'
  && event.args.referenceHash.toLowerCase() === referenceHash.toLowerCase()
  && event.args.payer.toLowerCase() === payer.toLowerCase()
  && event.args.recipient.toLowerCase() === recipient.toLowerCase()
  && event.args.token.toLowerCase() === usdcAddress
  && event.args.amount === amountUnits
  && event.args.paymentReference === reference
  && event.args.memo === memo)
const retainedBalance = await client.call({ to: usdcAddress, data: encodeFunctionData({ abi: balanceAbi, functionName: 'balanceOf', args: [prototypeAddress] }), blockNumber: receipt.blockNumber })
const retained = retainedBalance.data ? BigInt(retainedBalance.data) : null
const checks = { receiptSuccess: receipt.status === 'success', exactUsdcTransfer: Boolean(exactTransfer), exactInvoicePaymentEvent: Boolean(exactEvent), prototypeRetainedBalanceZero: retained === 0n }

console.log(JSON.stringify({ txHash, blockNumber: receipt.blockNumber.toString(), checks, observed: { transferLogCount: transferLogs.length, invoicePaymentEventCount: decodedEvents.length, prototypeRetainedUsdc: retained === null ? null : formatUnits(retained, 6) }, pass: Object.values(checks).every(Boolean) }, null, 2))
if (!Object.values(checks).every(Boolean)) process.exitCode = 1
