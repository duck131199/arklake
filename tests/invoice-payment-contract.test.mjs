import test from 'node:test'
import assert from 'node:assert/strict'
import { decodeFunctionData } from 'viem'
import {
  arklakeInvoicePaymentMemoMaxBytes,
  arklakeInvoicePaymentV2Address,
  buildArklakeInvoicePaymentBatch,
  invoicePaymentBatchSignature,
  utf8ByteLength,
} from '../server/invoice-payment-contract.ts'
import { invoicePaymentUsdcAddress } from '../server/invoice-payment-verify-core.ts'

const approveAbi = [{ type: 'function', name: 'approve', stateMutability: 'nonpayable', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] }]
const payAbi = [{ type: 'function', name: 'pay', stateMutability: 'nonpayable', inputs: [{ name: 'recipient', type: 'address' }, { name: 'amount', type: 'uint256' }, { name: 'paymentReference', type: 'string' }, { name: 'memo', type: 'string' }], outputs: [] }]

test('builds exactly approve then V2 pay for Circle SCA executeBatch', () => {
  const recipient = '0xd94074edb1da4c98959d455172beb58e4400324f'
  const batch = buildArklakeInvoicePaymentBatch({ usdcAddress: invoicePaymentUsdcAddress, recipient, amount: 1_000_000n, paymentReference: 'ARK-20260912-B1C18C96', memo: 'Test memo' })
  assert.equal(invoicePaymentBatchSignature, 'executeBatch((address,uint256,bytes)[])')
  assert.equal(batch[0].length, 2)
  assert.equal(batch[0][0][0], invoicePaymentUsdcAddress)
  assert.equal(batch[0][1][0], arklakeInvoicePaymentV2Address)
  const approve = decodeFunctionData({ abi: approveAbi, data: batch[0][0][2] })
  const pay = decodeFunctionData({ abi: payAbi, data: batch[0][1][2] })
  assert.deepEqual([approve.args[0].toLowerCase(), approve.args[1]], [arklakeInvoicePaymentV2Address, 1_000_000n])
  assert.deepEqual([pay.args[0].toLowerCase(), ...pay.args.slice(1)], [recipient, 1_000_000n, 'ARK-20260912-B1C18C96', 'Test memo'])
})

test('counts UTF-8 bytes and rejects Memo above 64 bytes without truncation', () => {
  assert.equal(utf8ByteLength('é'), 2)
  const input = { usdcAddress: invoicePaymentUsdcAddress, recipient: '0xd94074edb1da4c98959d455172beb58e4400324f', amount: 1n, paymentReference: 'ARK-20260912-B1C18C96' }
  assert.doesNotThrow(() => buildArklakeInvoicePaymentBatch({ ...input, memo: 'é'.repeat(arklakeInvoicePaymentMemoMaxBytes / 2) }))
  assert.throws(() => buildArklakeInvoicePaymentBatch({ ...input, memo: `${'a'.repeat(63)}é` }), /64-byte/)
})
