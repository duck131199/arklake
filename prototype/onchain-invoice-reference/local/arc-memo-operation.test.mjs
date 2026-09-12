import assert from 'node:assert/strict'
import test from 'node:test'
import { decodeFunctionData, encodeFunctionData, hexToString, keccak256, toBytes } from 'viem'
import { ARC_MEMO_FIXTURE, arcMemoOperation, transferCallData, transferCallDataHash } from './arc-memo-operation.mjs'

const memoAbi = [{
  type: 'function', name: 'memo', stateMutability: 'nonpayable',
  inputs: [
    { name: 'target', type: 'address' },
    { name: 'data', type: 'bytes' },
    { name: 'memoId', type: 'bytes32' },
    { name: 'memoData', type: 'bytes' },
  ],
  outputs: [],
}]
const transferAbi = [{
  type: 'function', name: 'transfer', stateMutability: 'nonpayable',
  inputs: [{ name: 'recipient', type: 'address' }, { name: 'amount', type: 'uint256' }],
  outputs: [{ name: '', type: 'bool' }],
}]

test('fixed Arc Memo operation carries exact plaintext memo and USDC transfer', () => {
  const memoCallData = encodeFunctionData({
    abi: memoAbi,
    functionName: 'memo',
    args: arcMemoOperation.abiParameters,
  })
  const memo = decodeFunctionData({ abi: memoAbi, data: memoCallData })
  const transfer = decodeFunctionData({ abi: transferAbi, data: memo.args[1] })

  assert.equal(arcMemoOperation.contractAddress, ARC_MEMO_FIXTURE.contract)
  assert.equal(memo.functionName, 'memo')
  assert.equal(memo.args[0].toLowerCase(), ARC_MEMO_FIXTURE.usdc)
  assert.equal(memo.args[2], keccak256(toBytes(ARC_MEMO_FIXTURE.memoIdSource)))
  assert.equal(hexToString(memo.args[3]), 'Thanks Miley')
  assert.equal(transfer.functionName, 'transfer')
  assert.equal(transfer.args[0].toLowerCase(), ARC_MEMO_FIXTURE.recipient)
  assert.equal(transfer.args[1], 10000n)
  assert.equal(memo.args[1], transferCallData)
  assert.equal(keccak256(memo.args[1]), transferCallDataHash)
})
