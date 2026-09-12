import { encodeFunctionData, keccak256, toBytes } from 'viem'

export const ARC_MEMO_FIXTURE = Object.freeze({
  contract: '0x5294e9927c3306dcbadb03fe70b92e01ccede505',
  usdc: '0x3600000000000000000000000000000000000000',
  recipient: '0xfe7b60284682c530f4f03b0954aa459ab193bac8',
  amount: '10000',
  memoText: 'Thanks Miley',
  memoIdSource: 'arklake:prototype:memo:ARK-MEMO-001',
  memoId: keccak256(toBytes('arklake:prototype:memo:ARK-MEMO-001')),
  memoData: `0x${Buffer.from('Thanks Miley', 'utf8').toString('hex')}`,
})

const transferAbi = [{
  type: 'function', name: 'transfer', stateMutability: 'nonpayable',
  inputs: [{ name: 'recipient', type: 'address' }, { name: 'amount', type: 'uint256' }],
  outputs: [{ name: '', type: 'bool' }],
}]

export const transferCallData = encodeFunctionData({
  abi: transferAbi,
  functionName: 'transfer',
  args: [ARC_MEMO_FIXTURE.recipient, BigInt(ARC_MEMO_FIXTURE.amount)],
})

export const transferCallDataHash = keccak256(transferCallData)

export const arcMemoOperation = Object.freeze({
  contractAddress: ARC_MEMO_FIXTURE.contract,
  abiFunctionSignature: 'memo(address,bytes,bytes32,bytes)',
  abiParameters: [
    ARC_MEMO_FIXTURE.usdc,
    transferCallData,
    ARC_MEMO_FIXTURE.memoId,
    ARC_MEMO_FIXTURE.memoData,
  ],
})
