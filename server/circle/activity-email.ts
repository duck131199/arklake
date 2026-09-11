export type EmailActivityLeg = {
  direction: 'in' | 'out'
  amount: string
  symbol: string | null
  sourceAddress?: string | null
  destinationAddress?: string | null
}

export type EmailActivity = {
  id: string
  type: 'receive' | 'send' | 'swap'
  status: 'confirmed'
  occurredAt: string
  confirmedAt: string | null
  blockchain: string
  txHash: string | null
  sourceAddress?: string | null
  destinationAddress?: string | null
  networkFee?: string | null
  legs: EmailActivityLeg[]
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]!)
}

function amount(leg: EmailActivityLeg | undefined) {
  return leg ? `${leg.amount} ${leg.symbol || 'token'}` : 'Amount unavailable'
}

function short(value: string) {
  return value.length > 13 ? `${value.slice(0, 6)}…${value.slice(-4)}` : value
}

function detailRow(label: string, value: string, accent = false) {
  return `<tr><td style="padding:10px 0;color:#708593">${escapeHtml(label)}</td><td align="right" style="padding:10px 0;color:${accent ? '#075e68' : '#102a43'};font-weight:${accent ? '700' : '500'}">${escapeHtml(value)}</td></tr>`
}

export function activityEmail(activity: EmailActivity) {
  const incoming = activity.legs.find((leg) => leg.direction === 'in')
  const outgoing = activity.legs.find((leg) => leg.direction === 'out')
  const incomingAmount = amount(incoming)
  const receivedAmount = incoming ? `${incoming.amount}${incoming.symbol ? ` ${incoming.symbol}` : ''}` : 'Amount unavailable'
  const outgoingAmount = amount(outgoing)
  const subject = activity.type === 'receive' ? `You received ${receivedAmount}`
    : activity.type === 'send' ? `${outgoingAmount} sent successfully` : 'Swap successful'
  const headline = activity.type === 'send' ? `${outgoing?.symbol || 'Transfer'} sent successfully` : subject
  const supporting = activity.type === 'receive' ? 'Your transfer has been confirmed.'
    : activity.type === 'send' ? `Your transfer of ${outgoingAmount} has been confirmed.` : 'Your swap has been confirmed.'
  const time = new Date(activity.confirmedAt || activity.occurredAt).toLocaleString('en-US', { timeZone: 'UTC', dateStyle: 'medium', timeStyle: 'short' }) + ' UTC'
  const arcscanUrl = activity.txHash ? `https://testnet.arcscan.app/tx/${encodeURIComponent(activity.txHash)}` : null
  const from = incoming?.sourceAddress || activity.sourceAddress
  const to = outgoing?.destinationAddress || activity.destinationAddress
  const network = activity.blockchain === 'ARC-TESTNET' ? 'Arc Testnet' : activity.blockchain
  const details = activity.type === 'swap'
    ? [['Pay', outgoingAmount], ['Receive', incomingAmount], ['Time', time], ...(activity.networkFee ? [['Fee', activity.networkFee]] : []), ...(activity.txHash ? [['Transaction', short(activity.txHash)]] : [])]
    : activity.type === 'receive'
      ? [['Amount received', receivedAmount], ...(from ? [['From', short(from)]] : []), ['Confirmed at', time], ['Network', network], ...(activity.txHash ? [['Transaction', short(activity.txHash)]] : [])]
      : [['Amount', outgoingAmount], ...(to ? [['To', short(to)]] : []), ['Time', time], ...(activity.networkFee ? [['Fee', activity.networkFee]] : []), ...(activity.txHash ? [['Transaction', short(activity.txHash)]] : [])]
  const rows = details.map(([label, value]) => detailRow(label, value, activity.type === 'swap' && label === 'Receive')).join('')
  const hero = activity.type === 'swap' ? `<div style="margin:25px 0 0;border-radius:14px;background:#f0f9f8;padding:17px 20px;text-align:center;color:#075e68;font-size:23px;font-weight:700;line-height:31px">${escapeHtml(outgoingAmount)} <span style="color:#61a7a9">→</span> ${escapeHtml(incomingAmount)}</div>` : ''
  const ctaLabel = activity.type === 'receive' ? 'View on Arcscan' : 'View transaction'
  const cta = arcscanUrl ? `<p style="margin:26px 0 0"><a href="${arcscanUrl}" style="display:inline-block;border-radius:999px;background:#102a43;padding:12px 20px;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none">${ctaLabel}</a></p>` : ''
  return {
    subject,
    text: `${headline}\n\n${supporting}${activity.type === 'swap' ? `\n\n${outgoingAmount} → ${incomingAmount}` : ''}\n\n${details.map(([label, value]) => `${label}: ${value}`).join('\n')}${arcscanUrl ? `\n\n${ctaLabel}: ${arcscanUrl}` : ''}`,
    html: `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head><body style="margin:0;background:#f3f8f8;padding:0"><div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(supporting)}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f3f8f8"><tr><td align="center" style="padding:36px 16px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px"><tr><td align="center" style="padding-bottom:12px;font-family:Arial,sans-serif;color:#102a43"><img src="https://arklake.site/brand/arklake-mark-trimmed.png" width="36" height="36" alt="Arklake" style="display:block;border:0"><div style="padding-top:7px;font-size:18px;font-weight:700;letter-spacing:-0.4px">Arklake</div></td></tr><tr><td style="border:1px solid #e7eeee;border-radius:20px;background:#ffffff;padding:34px 32px;font-family:Arial,sans-serif;color:#102a43"><h1 style="margin:0;font-size:28px;line-height:36px;letter-spacing:-0.7px">${escapeHtml(headline)}</h1><p style="margin:14px 0 0;color:#526b7a;font-size:16px;line-height:25px">${escapeHtml(supporting)}</p>${hero}<div style="margin-top:${activity.type === 'swap' ? '25px' : '28px'};border-top:1px solid #edf2f2;padding-top:10px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="font-size:14px;line-height:21px">${rows}</table></div>${cta}</td></tr></table></td></tr></table></body></html>`,
  }
}

export function notificationIdempotencyKey(activityId: string) {
  return `wallet-activity-email-${activityId}`
}

export function transactionEmailEnabled(value: string | undefined) {
  return value === 'true'
}

export function transactionEmailActivationTime(value: string | undefined) {
  if (!value) return null
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? timestamp : null
}

export function activityEmailMaySend(confirmedAt: string | null, enabledAt: number | null) {
  if (enabledAt === null || !confirmedAt) return false
  const confirmedTimestamp = Date.parse(confirmedAt)
  return Number.isFinite(confirmedTimestamp) && confirmedTimestamp >= enabledAt
}

export function notificationBelongsToAccount(jobAccountId: string, currentAccountId: string) {
  return jobAccountId === currentAccountId
}
