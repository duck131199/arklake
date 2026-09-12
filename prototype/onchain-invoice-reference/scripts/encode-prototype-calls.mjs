import { encodeFunctionData, isAddress, parseUnits } from 'viem'

const usdcAddress = '0x3600000000000000000000000000000000000000'
const args = Object.fromEntries(process.argv.slice(2).map((entry) => {
  const separator = entry.indexOf('=')
  return separator < 0 ? [entry.replace(/^--/, ''), ''] : [entry.slice(0, separator).replace(/^--/, ''), entry.slice(separator + 1)]
}))

const required = (name) => {
  const value = args[name]
  if (!value) throw new Error(`Missing --${name}=...`)
  return value
}

const prototypeAddress = required('prototype')
const recipient = required('recipient')
const amount = required('amount')
const reference = required('reference')
const memo = args.memo ?? 'Thanks Miley'
if (!isAddress(prototypeAddress) || !isAddress(recipient)) throw new Error('Prototype and recipient must be EVM addresses.')
if (Buffer.byteLength(reference, 'utf8') < 1 || Buffer.byteLength(reference, 'utf8') > 32) throw new Error('Reference must be 1-32 UTF-8 bytes.')
if (Buffer.byteLength(memo, 'utf8') > 64) throw new Error('Memo must be at most 64 UTF-8 bytes.')

const amountUnits = parseUnits(amount, 6)
if (amountUnits <= 0n) throw new Error('Amount must be positive with at most 6 decimals.')

const erc20Abi = [{ type: 'function', name: 'approve', stateMutability: 'nonpayable', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] }]
const paymentAbi = [{ type: 'function', name: 'pay', stateMutability: 'nonpayable', inputs: [{ name: 'recipient', type: 'address' }, { name: 'amount', type: 'uint256' }, { name: 'paymentReference', type: 'string' }, { name: 'memo', type: 'string' }], outputs: [] }]
const batchAbi = [{ type: 'function', name: 'executeBatch', stateMutability: 'payable', inputs: [{ name: 'calls', type: 'tuple[]', components: [{ name: 'target', type: 'address' }, { name: 'value', type: 'uint256' }, { name: 'data', type: 'bytes' }] }], outputs: [] }]

const approveCallData = encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [prototypeAddress, amountUnits] })
const payCallData = encodeFunctionData({ abi: paymentAbi, functionName: 'pay', args: [recipient, amountUnits, reference, memo] })
const batchCalls = [{ target: usdcAddress, value: 0n, data: approveCallData }, { target: prototypeAddress, value: 0n, data: payCallData }]
const batchCallData = encodeFunctionData({ abi: batchAbi, functionName: 'executeBatch', args: [batchCalls] })

console.log(JSON.stringify({
  inputs: { usdcAddress, prototypeAddress, recipient, amount, amountUnits: amountUnits.toString(), reference, memo },
  sequential: [
    { contractAddress: usdcAddress, abiFunctionSignature: 'approve(address,uint256)', abiParameters: [prototypeAddress, amountUnits.toString()], callData: approveCallData },
    { contractAddress: prototypeAddress, abiFunctionSignature: 'pay(address,uint256,string,string)', abiParameters: [recipient, amountUnits.toString(), reference, memo], callData: payCallData },
  ],
  atomicBatch: { contractAddress: '<CIRCLE_SCA_WALLET_ADDRESS>', abiFunctionSignature: 'executeBatch((address,uint256,bytes)[])', abiParameters: [batchCalls.map((call) => [call.target, call.value.toString(), call.data])], callData: batchCallData },
}, null, 2))
