import type { VercelRequest, VercelResponse } from '@vercel/node'
import gatewayReadiness from '../../server/circle/gateway-readiness-handler.js'
import gatewayMovePrepare from '../../server/circle/gateway-move-prepare-handler.js'
import gatewayMoveConfirm from '../../server/circle/gateway-move-confirm-handler.js'

const gatewayHandlers = {
  'gateway-readiness': gatewayReadiness,
  'gateway-move-prepare': gatewayMovePrepare,
  'gateway-move-confirm': gatewayMoveConfirm,
} as const

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  const route = req.query.gateway
  const routeHandler = typeof route === 'string'
    ? gatewayHandlers[route as keyof typeof gatewayHandlers]
    : undefined

  if (!routeHandler) {
    return res.status(404).json({
      ok: false,
      error: { code: 'NOT_FOUND', stage: 'request', retryable: false },
    })
  }

  return routeHandler(req, res)
}
