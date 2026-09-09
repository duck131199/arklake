import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { verifyInvoicePaymentReceipt, invoicePaymentChainId, invoicePaymentUsdcAddress, erc20TransferTopic } from '../server/invoice-payment-verify-core.ts'

const migration = readFileSync(new URL('../supabase/migrations/202609090001_invoice_completion_lifecycle.sql', import.meta.url), 'utf8')
const verifierApi = readFileSync(new URL('../api/invoice-payment-verify.ts', import.meta.url), 'utf8')
const recipient = '0xd94074edb1da4c98959d455172beb58e4400324f'
const payer = '0xb1f9ee64333564050964241688899166307d446e'
const topic = (address) => `0x${address.slice(2).padStart(64, '0')}`

test('scheduled expiry persists only active invoices that are due', () => {
  assert.match(migration, /create extension if not exists pg_cron/)
  assert.match(migration, /cron\.schedule\([\s\S]*'arklake-expire-due-invoices'[\s\S]*'\* \* \* \* \*'/)
  assert.match(migration, /update public\.invoices[\s\S]*where status = 'active' and expires_at <= now\(\)/)
  assert.doesNotMatch(migration, /where status (?:=|in)[^;]*paid/)
  assert.match(migration, /revoke all on function public\.expire_due_invoices\(\) from public, anon, authenticated/)
})

test('a submitted payment may finish after expiry only when its block time is in the invoice window', () => {
  assert.match(verifierApi, /intent\.status === 'submitted' \|\| intent\.status === 'confirming'/)
  assert.match(verifierApi, /mayFinishSubmittedPayment/)
  assert.match(migration, /target\.status not in \('active', 'expired'\)/)
  assert.match(migration, /p_paid_at < target\.created_at or p_paid_at > target\.expires_at/)

  const blockTimestamp = 1_789_000_000
  const exactExpiry = new Date(blockTimestamp * 1000).toISOString()
  const result = verifyInvoicePaymentReceipt({
    chainId: `0x${invoicePaymentChainId.toString(16)}`,
    latestBlock: '0x65',
    blockTimestamp: `0x${blockTimestamp.toString(16)}`,
    receipt: {
      status: '0x1',
      blockNumber: '0x64',
      logs: [{
        address: invoicePaymentUsdcAddress,
        topics: [erc20TransferTopic, topic(payer), topic(recipient)],
        data: `0x${1_000_000n.toString(16).padStart(64, '0')}`,
      }],
    },
    invoice: {
      amount: '1', asset: 'USDC', recipientAddress: recipient,
      createdAt: new Date((blockTimestamp - 60) * 1000).toISOString(), expiresAt: exactExpiry,
    },
  })
  assert.equal(result.ok, true)
  assert.equal(result.paidAt, exactExpiry)
})

test('lifecycle migration preserves strict snapshot and transaction reuse checks', () => {
  assert.match(migration, /lower\(target\.receiving_wallet_address\) <> lower\(p_recipient_address\)/)
  assert.match(migration, /target\.amount <> p_amount or target\.asset <> p_asset/)
  assert.match(migration, /payment_tx_hash = p_tx_hash and id <> target\.id/)
  assert.match(migration, /exception when unique_violation[\s\S]*'tx_reused'/)
  assert.doesNotMatch(migration, /insert into public\.wallet_activities/)
})
