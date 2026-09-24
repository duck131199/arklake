import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto'

const version = 'v1'

function key() {
  const encoded = process.env.GATEWAY_CHALLENGE_RESPONSE_ENCRYPTION_KEY
  if (!encoded) throw new Error('Gateway challenge response encryption is not configured.')
  const decoded = Buffer.from(encoded, 'base64')
  if (decoded.length !== 32) throw new Error('Gateway challenge response encryption key must be 32 bytes.')
  return decoded
}

export type GatewayChallengeResponseMaterial =
  | { status: 'APPROVED'; signature: string }
  | { status: 'REJECTED' }

export function encryptGatewayChallengeResponse(material: GatewayChallengeResponseMaterial) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(), iv)
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(material), 'utf8'), cipher.final()])
  return [version, iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), ciphertext.toString('base64url')].join('.')
}

export function decryptGatewayChallengeResponse(value: string): GatewayChallengeResponseMaterial {
  const [storedVersion, ivValue, tagValue, ciphertextValue, extra] = value.split('.')
  if (storedVersion !== version || !ivValue || !tagValue || !ciphertextValue || extra) throw new Error('Invalid encrypted challenge response.')
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(ivValue, 'base64url'))
  decipher.setAuthTag(Buffer.from(tagValue, 'base64url'))
  const decoded = Buffer.concat([decipher.update(Buffer.from(ciphertextValue, 'base64url')), decipher.final()]).toString('utf8')
  const material = JSON.parse(decoded) as unknown
  if (!material || typeof material !== 'object') throw new Error('Invalid challenge response material.')
  const record = material as Record<string, unknown>
  if (record.status === 'REJECTED') return { status: 'REJECTED' }
  if (record.status === 'APPROVED' && typeof record.signature === 'string') return { status: 'APPROVED', signature: record.signature }
  throw new Error('Invalid challenge response material.')
}

export function sameGatewayChallengeResponse(left: GatewayChallengeResponseMaterial, right: GatewayChallengeResponseMaterial) {
  const leftValue = JSON.stringify(left)
  const rightValue = JSON.stringify(right)
  const leftBuffer = Buffer.from(leftValue)
  const rightBuffer = Buffer.from(rightValue)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}
