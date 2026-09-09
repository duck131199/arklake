import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')

test('root and sign-in wait for session restore before rendering public auth UI', () => {
  const publicInvoice = app.indexOf('if (publicInvoiceId)')
  const entryRoute = app.indexOf("const isSessionEntryRoute = currentPath === '/' || currentPath === '/auth/sign-in'")
  const checking = app.indexOf("if (isSessionEntryRoute && sessionStatus === 'checking')", entryRoute)
  const authenticated = app.indexOf("if (isSessionEntryRoute && sessionStatus === 'authenticated')", checking)
  const authPage = app.indexOf("if (currentPath === '/auth/sign-in')", authenticated)
  const landing = app.indexOf('<main className="min-h-screen bg-lake-canvas text-deep-text">', authPage)
  assert.ok(publicInvoice > -1 && entryRoute > publicInvoice && checking > entryRoute && authenticated > checking && authPage > authenticated && landing > authPage)
})

test('a restored authenticated session redirects root or sign-in to the app without mounting Circle auth', () => {
  assert.match(app, /if \(isSessionEntryRoute && sessionStatus === 'authenticated'\) \{\s+return <AppRedirect to="\/app" onNavigate=\{setCurrentPath\} \/>/)
  assert.match(app, /if \(currentPath === '\/auth\/sign-in'\) \{\s+return <AuthPage/)
})

test('sign out still clears local session state and returns to landing', () => {
  const start = app.indexOf('const handleSignOut = () =>')
  const end = app.indexOf('\n  const invoiceDetailId', start)
  const flow = app.slice(start, end)
  assert.match(flow, /method: 'DELETE'/)
  assert.match(flow, /setSessionStatus\('anonymous'\)/)
  assert.match(flow, /handleAppNavigate\('\/'\)/)
})

test('app and Public Invoice routing remain ahead of the entry-route redirect', () => {
  assert.match(app, /if \(publicInvoiceId\)[\s\S]+if \(isSessionEntryRoute/)
  assert.match(app, /if \(currentPath\.startsWith\('\/app'\) && sessionStatus === 'checking'\)/)
  assert.match(app, /if \(currentPath\.startsWith\('\/app'\) && sessionStatus !== 'authenticated'\)/)
})
