import { useEffect, useRef, useState } from 'react'

const shellWidth = 'site-shell'

const productNavItems = [
  ['Invoicing', 'Create and send invoices by email. Get paid in USDC.'],
  ['Wallet', 'Receive, send and manage stablecoins.'],
  ['Swap', 'Convert supported assets to USDC.'],
]

const docsRoutes = {
  'Getting Started': '/docs/getting-started',
  Invoicing: '/docs/invoicing',
  Payments: '/docs/payments',
  Wallet: '/docs/wallet',
  Swap: '/docs/swap',
  Technical: '/docs/technical',
} as const

const docsHomeCards = [
  ['Getting Started', 'Create your account and start using Arklake.'],
  ['Invoicing', 'Create, send and track invoices.'],
  ['Payments', 'Understand how invoices are paid and verified.'],
  ['Wallet', 'Receive, send and manage stablecoins.'],
  ['Swap', 'Convert supported assets to USDC.'],
  ['Technical', 'Learn about account, verification and payment infrastructure.'],
]

function getDocsRoute(title: string) {
  return docsRoutes[title as keyof typeof docsRoutes]
}

function ProductMark() {
  return <img className="docs-product-mark h-[30px] max-w-full" src="/brand/arklake-mark-trimmed.png" alt="Arklake" />
}

type DocsThemePreference = 'system' | 'light' | 'dark'
type DocsResolvedTheme = 'light' | 'dark'

const docsThemeStorageKey = 'arklake-docs-theme'

function getSystemDocsTheme(): DocsResolvedTheme {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function useDocsTheme() {
  const [preference, setPreferenceState] = useState<DocsThemePreference>(() => {
    if (typeof window === 'undefined') return 'system'
    const saved = window.localStorage.getItem(docsThemeStorageKey)
    return saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'system'
  })
  const [systemTheme, setSystemTheme] = useState<DocsResolvedTheme>(getSystemDocsTheme)

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const updateSystemTheme = () => setSystemTheme(media.matches ? 'dark' : 'light')

    updateSystemTheme()
    media.addEventListener('change', updateSystemTheme)
    return () => media.removeEventListener('change', updateSystemTheme)
  }, [])

  const setPreference = (nextPreference: DocsThemePreference) => {
    setPreferenceState(nextPreference)
    window.localStorage.setItem(docsThemeStorageKey, nextPreference)
  }

  return {
    preference,
    resolvedTheme: preference === 'system' ? systemTheme : preference,
    setPreference,
  }
}

function DocsThemeSelector({ preference, onPreferenceChange }: { preference: DocsThemePreference; onPreferenceChange: (preference: DocsThemePreference) => void }) {
  const [isOpen, setIsOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const options: { value: DocsThemePreference; label: string }[] = [
    { value: 'system', label: 'System' },
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
  ]

  useEffect(() => {
    if (!isOpen) return

    const handlePointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setIsOpen(false)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  return (
    <div ref={menuRef} className="relative shrink-0">
      <button
        type="button"
        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[color:var(--docs-border)] bg-[var(--docs-surface)] text-[var(--docs-text-primary)] shadow-[var(--docs-shadow-sm)] transition hover:border-[color:var(--docs-border-strong)] focus:outline-none focus:ring-4 focus:ring-[color:var(--docs-focus-ring)]"
        aria-label="Choose docs theme"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
      >
        <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M8 2.25v1.1M8 12.65v1.1M3.65 3.65l.78.78M11.57 11.57l.78.78M2.25 8h1.1M12.65 8h1.1M3.65 12.35l.78-.78M11.57 4.43l.78-.78" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" />
          <circle cx="8" cy="8" r="2.65" stroke="currentColor" strokeWidth="1.45" />
        </svg>
      </button>

      {isOpen ? (
        <div className="absolute right-0 z-20 mt-2 w-40 max-w-[calc(100vw-2rem)] rounded-2xl border border-[color:var(--docs-border)] bg-[var(--docs-elevated)] p-1.5 shadow-[var(--docs-shadow-menu)]" role="menu">
          {options.map((option) => {
            const isSelected = option.value === preference
            return (
              <button
                key={option.value}
                type="button"
                className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-[color:var(--docs-focus-ring)] ${
                  isSelected ? 'bg-[var(--docs-aqua-bg)] text-[var(--docs-text-primary)]' : 'text-[var(--docs-text-body)] hover:bg-[var(--docs-menu-hover)] hover:text-[var(--docs-text-primary)]'
                }`}
                role="menuitemradio"
                aria-checked={isSelected}
                onClick={() => {
                  onPreferenceChange(option.value)
                  setIsOpen(false)
                }}
              >
                <span>{option.label}</span>
                {isSelected ? (
                  <svg className="h-3.5 w-3.5 text-[var(--docs-aqua)]" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                    <path d="M3 7.1 5.65 9.6 11 4.25" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : null}
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

function DocsHeader({ themePreference, onThemePreferenceChange }: { themePreference: DocsThemePreference; onThemePreferenceChange: (preference: DocsThemePreference) => void }) {
  return (
    <header className="border-b border-[color:var(--docs-border)] bg-[var(--docs-header-bg)] backdrop-blur-xl">
      <div className={`${shellWidth} flex min-w-0 items-center justify-between gap-3 py-5`}>
        <div className="flex min-w-0 items-center gap-4">
          <a href="/" className="flex shrink-0 items-center text-[var(--docs-text-primary)]">
            <ProductMark />
          </a>
          <span className="h-7 w-px bg-[var(--docs-border)]" aria-hidden="true" />
          <a href="/docs" className="text-sm font-semibold tracking-[-0.01em] text-[var(--docs-text-primary)]">
            Docs
          </a>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <DocsThemeSelector preference={themePreference} onPreferenceChange={onThemePreferenceChange} />
          <a className="inline-flex shrink-0 items-center justify-center rounded-full border border-[color:var(--docs-border)] bg-[var(--docs-surface)] px-4 py-2.5 text-sm font-semibold text-[var(--docs-text-primary)] shadow-[var(--docs-shadow-sm)] transition hover:border-[color:var(--docs-border-strong)] focus:outline-none focus:ring-4 focus:ring-[color:var(--docs-focus-ring)]" href="/">
            Back to Arklake
          </a>
        </div>
      </div>
    </header>
  )
}

function DocsFooter() {
  return (
    <footer className="border-t border-[color:var(--docs-border)] bg-[var(--docs-footer-bg)]">
      <div className={`${shellWidth} py-8 sm:py-9`}>
        <div className="grid min-w-0 grid-cols-1 gap-7 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:items-start md:gap-12">
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-4">
              <ProductMark />
              <span className="text-sm font-semibold tracking-[-0.01em] text-[var(--docs-text-primary)]">Arklake Docs</span>
            </div>
            <p className="mt-5 max-w-sm text-sm leading-6 text-[var(--docs-text-body)]">
              Documentation for using Arklake and understanding how payments work.
            </p>
          </div>

          <div className="min-w-0 md:justify-self-end">
            <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--docs-aqua)] md:text-right">Docs</h2>
            <div className="mt-4 grid min-w-0 grid-cols-2 gap-x-8 gap-y-2 sm:grid-cols-3 md:gap-x-10">
              {docsHomeCards.map(([title]) => (
                <a key={title} className="text-sm leading-6 text-[var(--docs-text-body)] transition hover:text-[var(--docs-text-primary)] md:text-right" href={getDocsRoute(title)}>
                  {title}
                </a>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-7 border-t border-[color:var(--docs-border)] pt-5">
          <p className="text-sm leading-6 text-[var(--docs-text-body)]">© 2026 Arklake</p>
        </div>
      </div>
    </footer>
  )
}

function DocsShell({ children }: { children: React.ReactNode }) {
  const { preference, resolvedTheme, setPreference } = useDocsTheme()

  return (
    <main className="docs-theme min-h-screen bg-[var(--docs-bg)] text-[var(--docs-text-primary)]" data-docs-theme={resolvedTheme} data-docs-theme-preference={preference}>
      <DocsHeader themePreference={preference} onThemePreferenceChange={setPreference} />
      {children}
      <DocsFooter />
    </main>
  )
}

function DocsPage() {
  return (
    <DocsShell>
      <section className={`${shellWidth} py-16 sm:py-20 lg:py-24`}>
        <div className="max-w-3xl min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--docs-aqua)]">Arklake Docs</p>
          <h1 className="mt-4 max-w-[21rem] text-[2.35rem] font-semibold leading-[1.04] tracking-[-0.06em] text-[var(--docs-text-primary)] sm:max-w-[42rem] sm:text-6xl lg:text-[4.35rem]">
            Everything you need to use Arklake.
          </h1>
          <p className="mt-5 max-w-[21rem] text-base leading-7 text-[var(--docs-text-body)] sm:max-w-[40rem] sm:text-lg sm:leading-8">
            Learn how to create invoices, make payments, manage stablecoins and use Arklake from one simple account.
          </p>
        </div>

        <div className="mt-12 grid max-w-5xl min-w-0 grid-cols-1 gap-4 sm:mt-14 md:grid-cols-3 md:gap-5">
          {docsHomeCards.map(([title, description]) => (
            <a key={title} className="group flex min-w-0 flex-col rounded-[1.5rem] border border-[color:var(--docs-border)] bg-[var(--docs-surface)] p-5 shadow-[var(--docs-shadow-card)] transition md:hover:-translate-y-0.5 md:hover:border-[color:var(--docs-border-strong)] md:hover:shadow-[var(--docs-shadow-card-hover)]" href={getDocsRoute(title)}>
              <h2 className="text-lg font-semibold tracking-[-0.025em] text-[var(--docs-text-primary)]">{title}</h2>
              <p className="mt-3 min-h-[3rem] text-sm leading-6 text-[var(--docs-text-body)]">{description}</p>
              <span className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-[var(--docs-text-primary)]">
                Explore
                <svg className="h-3.5 w-3.5 text-[var(--docs-aqua)] transition md:group-hover:translate-x-0.5" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                  <path d="M3 7h7M7.75 4.25 10.5 7 7.75 9.75" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            </a>
          ))}
        </div>

        <section className="mt-16 max-w-5xl min-w-0 border-t border-[color:var(--docs-border)] pt-12 sm:mt-18 sm:pt-14" aria-labelledby="docs-roadmap-title">
          <div className="max-w-2xl min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--docs-aqua)]">Roadmap</p>
            <h2 id="docs-roadmap-title" className="mt-4 text-3xl font-semibold leading-[1.08] tracking-[-0.05em] text-[var(--docs-text-primary)] sm:text-4xl">
              What we're exploring next.
            </h2>
            <p className="mt-4 text-base leading-7 text-[var(--docs-text-body)] sm:text-lg sm:leading-8">
              A look at future ways Arklake could make stablecoin payments simpler for everyday businesses.
            </p>
          </div>

          <article className="mt-8 flex min-w-0 flex-col gap-5 rounded-[1.65rem] border border-[color:var(--docs-aqua-border)] bg-[var(--docs-aqua-bg)] p-6 sm:flex-row sm:items-start sm:justify-between sm:gap-8 sm:p-7">
            <div className="min-w-0">
              <h3 className="text-xl font-semibold tracking-[-0.035em] text-[var(--docs-text-primary)]">Merchant tools</h3>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--docs-text-body)] sm:text-base sm:leading-7">
                Payment requests, QR payments and Telegram-based workflows for everyday businesses.
              </p>
            </div>
            <span className="inline-flex w-fit shrink-0 items-center rounded-full border border-[color:var(--docs-aqua-border)] bg-[var(--docs-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--docs-text-primary)]">
              Planned
            </span>
          </article>
        </section>
      </section>
    </DocsShell>
  )
}

const gettingStartedSections = [
  {
    number: '01',
    title: 'Create your account',
    body: [
      'Sign up with your email address and verify your account.',
      "Arklake is designed around an account-first experience, so you don't need to connect an external wallet just to get started.",
    ],
  },
  {
    number: '02',
    title: 'Your wallet',
    body: [
      'Your Arklake account includes a wallet for receiving, sending and managing supported stablecoins.',
      'You interact with the account; Arklake handles the payment infrastructure behind the experience.',
    ],
  },
  {
    number: '03',
    title: 'Add funds',
    body: [
      'Receive supported stablecoins into your Arklake wallet before making a payment.',
      'Your available balance can then be used for supported Arklake payment flows.',
    ],
  },
]

const gettingStartedNextCards = [
  ['Invoicing', 'Create, send and track invoices.'],
  ['Payments', 'Learn how Arklake payments work and are verified.'],
  ['Wallet', 'Receive, send and manage stablecoins.'],
  ['Swap', 'Convert supported assets to USDC.'],
]

const invoicingNextCards = [
  ['Payments', 'Learn how invoice payments work and are verified.'],
  ['Wallet', 'Learn how balances, receiving and sending work.'],
  ['Getting Started', 'Learn the basics of using Arklake.'],
]

const paymentMethods = [
  ['Pay with Arklake', 'Sign in or create an Arklake account and pay through the Arklake experience.'],
  ['Scan QR', 'Use a compatible external wallet to scan the payment QR code.'],
  ['Connect wallet', 'Connect a compatible external wallet and pay without creating an Arklake account.'],
]

const paymentsNextCards = [
  ['Invoicing', 'Learn how invoices are created, sent and tracked.'],
  ['Wallet', 'Learn how receiving, sending and balances work.'],
  ['Swap', 'Learn how supported assets can be converted to USDC.'],
  ['Technical', 'Learn about payment verification and infrastructure in more detail.'],
]

const walletNextCards = [
  ['Payments', 'Learn how invoice payments work and are verified.'],
  ['Swap', 'Learn how supported assets can be converted to USDC.'],
  ['Invoicing', 'Learn how invoices are created, sent and tracked.'],
  ['Technical', 'Learn about wallet and payment infrastructure in more detail.'],
]

const swapNextCards = [
  ['Wallet', 'Learn how balances, receiving and sending work.'],
  ['Payments', 'Learn how invoice payments work and are verified.'],
  ['Invoicing', 'Learn how invoices are created, sent and tracked.'],
  ['Technical', 'Learn about payment and asset infrastructure in more detail.'],
]

const technicalBoundaries = [
  ['Account', 'User-facing identity and access layer.'],
  ['Wallet', 'Asset holding and transaction layer.'],
  ['Swap', 'Asset conversion.'],
  ['Unified Balance', 'USDC balance and spending infrastructure.'],
  ['Payments', 'Invoice payment workflow.'],
  ['Verification', 'Determines whether a submitted payment satisfies invoice requirements.'],
  ['Arc', 'Settlement and on-chain infrastructure Arklake is designed around.'],
  ['Circle', 'Wallet and USDC infrastructure relevant to the intended architecture.'],
]

const technicalNextCards = [
  ['Getting Started', 'Create your account and start using Arklake.'],
  ['Invoicing', 'Learn how invoices are created and tracked.'],
  ['Payments', 'Learn how invoice payments work.'],
  ['Wallet', 'Learn how balances, receiving and sending work.'],
]

function DocsBreadcrumb({ current }: { current: string }) {
  return (
    <nav className={`${shellWidth} pt-7`} aria-label="Breadcrumb">
      <ol className="flex min-w-0 items-center gap-2 text-sm text-[var(--docs-text-body)]">
        <li>
          <a className="font-medium text-[var(--docs-text-primary)] transition hover:text-[var(--docs-aqua)]" href="/docs">Docs</a>
        </li>
        <li className="text-[var(--docs-border)]" aria-hidden="true">/</li>
        <li className="min-w-0 truncate" aria-current="page">{current}</li>
      </ol>
    </nav>
  )
}

function GettingStartedPage() {
  return (
    <DocsShell>
      <DocsBreadcrumb current="Getting Started" />
      <article className={`${shellWidth} pb-16 pt-10 sm:pb-20 sm:pt-12 lg:pb-24`}>
        <header className="max-w-3xl min-w-0 border-b border-[color:var(--docs-border)] pb-10">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--docs-aqua)]">Getting Started</p>
          <h1 className="mt-4 text-[2.2rem] font-semibold leading-[1.06] tracking-[-0.055em] text-[var(--docs-text-primary)] sm:text-5xl">
            Get started with Arklake
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-[var(--docs-text-body)] sm:text-lg sm:leading-8">
            Create your account and get ready to send, receive and pay with stablecoins.
          </p>
        </header>

        <div className="max-w-3xl min-w-0 divide-y divide-[color:var(--docs-border)]">
          {gettingStartedSections.map((section) => (
            <section key={section.number} className="grid min-w-0 grid-cols-1 gap-4 py-10 sm:grid-cols-[2.75rem_minmax(0,1fr)] sm:gap-4" aria-labelledby={`getting-started-${section.number}`}>
              <p className="text-sm font-semibold tracking-[0.18em] text-[var(--docs-aqua)]">{section.number}</p>
              <div className="min-w-0">
                <h2 id={`getting-started-${section.number}`} className="text-2xl font-semibold tracking-[-0.04em] text-[var(--docs-text-primary)]">
                  {section.title}
                </h2>
                <div className="mt-4 space-y-4 text-base leading-7 text-[var(--docs-text-body)]">
                  {section.body.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </div>
              </div>
            </section>
          ))}

          <section className="grid min-w-0 grid-cols-1 gap-4 py-10 sm:grid-cols-[2.75rem_minmax(0,1fr)] sm:gap-4" aria-labelledby="getting-started-04">
            <p className="text-sm font-semibold tracking-[0.18em] text-[var(--docs-aqua)]">04</p>
            <div className="min-w-0">
              <h2 id="getting-started-04" className="text-2xl font-semibold tracking-[-0.04em] text-[var(--docs-text-primary)]">Start using Arklake</h2>
              <p className="mt-4 text-base leading-7 text-[var(--docs-text-body)]">Once your account is ready, you can:</p>
              <ul className="mt-5 grid min-w-0 grid-cols-1 gap-3 text-base leading-7 text-[var(--docs-text-body)] sm:grid-cols-2">
                {['Create and send invoices', 'Pay invoices', 'Receive payments', 'Send stablecoins', 'Manage your wallet', 'Swap supported assets to USDC'].map((item) => (
                  <li key={item} className="flex min-w-0 gap-3">
                    <span className="mt-3 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--docs-aqua)]" aria-hidden="true" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <section className="grid min-w-0 grid-cols-1 gap-4 py-10 sm:grid-cols-[2.75rem_minmax(0,1fr)] sm:gap-4" aria-labelledby="getting-started-05">
            <p className="text-sm font-semibold tracking-[0.18em] text-[var(--docs-aqua)]">05</p>
            <div className="min-w-0">
              <h2 id="getting-started-05" className="text-2xl font-semibold tracking-[-0.04em] text-[var(--docs-text-primary)]">What to read next</h2>
              <div className="mt-6 grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
                {gettingStartedNextCards.map(([title, description]) => (
                  <a key={title} className="rounded-[1.35rem] border border-[color:var(--docs-border)] bg-[var(--docs-surface)] p-5 shadow-[var(--docs-shadow-card)] transition hover:border-[color:var(--docs-border-strong)]" href={getDocsRoute(title)}>
                    <h3 className="text-lg font-semibold tracking-[-0.025em] text-[var(--docs-text-primary)]">{title}</h3>
                    <p className="mt-2 text-sm leading-6 text-[var(--docs-text-body)]">{description}</p>
                  </a>
                ))}
              </div>
            </div>
          </section>
        </div>
      </article>
    </DocsShell>
  )
}

function InvoicingPage() {
  return (
    <DocsShell>
      <DocsBreadcrumb current="Invoicing" />
      <article className={`${shellWidth} pb-16 pt-10 sm:pb-20 sm:pt-12 lg:pb-24`}>
        <header className="max-w-3xl min-w-0 border-b border-[color:var(--docs-border)] pb-10">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--docs-aqua)]">Invoicing</p>
          <h1 className="mt-4 text-[2.2rem] font-semibold leading-[1.06] tracking-[-0.055em] text-[var(--docs-text-primary)] sm:text-5xl">
            Create and send invoices with Arklake
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-[var(--docs-text-body)] sm:text-lg sm:leading-8">
            Create an invoice, send it to a payer by email, and track its status from your account.
          </p>
        </header>

        <div className="max-w-3xl min-w-0 divide-y divide-[color:var(--docs-border)]">
          <section className="grid min-w-0 grid-cols-1 gap-4 py-10 sm:grid-cols-[2.75rem_minmax(0,1fr)] sm:gap-4" aria-labelledby="invoicing-01">
            <p className="text-sm font-semibold tracking-[0.18em] text-[var(--docs-aqua)]">01</p>
            <div className="min-w-0">
              <h2 id="invoicing-01" className="text-2xl font-semibold tracking-[-0.04em] text-[var(--docs-text-primary)]">Create an invoice</h2>
              <p className="mt-4 text-base leading-7 text-[var(--docs-text-body)]">Start by creating a new invoice from your Arklake account.</p>
              <p className="mt-4 text-base leading-7 text-[var(--docs-text-body)]">Enter:</p>
              <ul className="mt-5 grid min-w-0 grid-cols-1 gap-3 text-base leading-7 text-[var(--docs-text-body)] sm:grid-cols-2">
                {['Payer email', 'Amount', 'Memo or payment description', 'Expiry'].map((item) => (
                  <li key={item} className="flex min-w-0 gap-3">
                    <span className="mt-3 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--docs-aqua)]" aria-hidden="true" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-5 text-base leading-7 text-[var(--docs-text-body)]">Arklake uses the payer's email as the primary delivery method for the invoice.</p>
            </div>
          </section>

          <section className="grid min-w-0 grid-cols-1 gap-4 py-10 sm:grid-cols-[2.75rem_minmax(0,1fr)] sm:gap-4" aria-labelledby="invoicing-02">
            <p className="text-sm font-semibold tracking-[0.18em] text-[var(--docs-aqua)]">02</p>
            <div className="min-w-0">
              <h2 id="invoicing-02" className="text-2xl font-semibold tracking-[-0.04em] text-[var(--docs-text-primary)]">Review the invoice details</h2>
              <p className="mt-4 text-base leading-7 text-[var(--docs-text-body)]">Before sending, review the payer, amount, memo and expiry.</p>
              <p className="mt-4 text-base leading-7 text-[var(--docs-text-body)]">The invoice should clearly show:</p>
              <ul className="mt-5 grid min-w-0 grid-cols-1 gap-3 text-base leading-7 text-[var(--docs-text-body)] sm:grid-cols-2">
                {['Who is being asked to pay', 'How much is due', 'What the payment is for', 'When the invoice expires'].map((item) => (
                  <li key={item} className="flex min-w-0 gap-3">
                    <span className="mt-3 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--docs-aqua)]" aria-hidden="true" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <section className="grid min-w-0 grid-cols-1 gap-4 py-10 sm:grid-cols-[2.75rem_minmax(0,1fr)] sm:gap-4" aria-labelledby="invoicing-03">
            <p className="text-sm font-semibold tracking-[0.18em] text-[var(--docs-aqua)]">03</p>
            <div className="min-w-0">
              <h2 id="invoicing-03" className="text-2xl font-semibold tracking-[-0.04em] text-[var(--docs-text-primary)]">Send the invoice</h2>
              <div className="mt-4 space-y-4 text-base leading-7 text-[var(--docs-text-body)]">
                <p>Once the invoice is created, Arklake sends the payer a secure link by email.</p>
                <p>The payer can open the invoice and choose how to pay.</p>
                <p>Creating or sending an invoice does not mean it has been paid.</p>
              </div>
            </div>
          </section>

          <section className="grid min-w-0 grid-cols-1 gap-4 py-10 sm:grid-cols-[2.75rem_minmax(0,1fr)] sm:gap-4" aria-labelledby="invoicing-04">
            <p className="text-sm font-semibold tracking-[0.18em] text-[var(--docs-aqua)]">04</p>
            <div className="min-w-0">
              <h2 id="invoicing-04" className="text-2xl font-semibold tracking-[-0.04em] text-[var(--docs-text-primary)]">Track invoice status</h2>
              <p className="mt-4 text-base leading-7 text-[var(--docs-text-body)]">You can review sent and received invoices from the Invoices area.</p>
              <p className="mt-4 text-base leading-7 text-[var(--docs-text-body)]">Invoice status should clearly distinguish each stage of the payment flow.</p>
              <p className="mt-4 text-base leading-7 text-[var(--docs-text-body)]">Arklake currently treats <code className="rounded-md border border-[color:var(--docs-border)] bg-[var(--docs-surface)] px-1.5 py-0.5 text-sm text-[var(--docs-text-primary)]">Paid</code> as a verified final state. Other lifecycle states will be documented as their implementation is finalized.</p>
              <div className="mt-6 rounded-[1.35rem] border border-[color:var(--docs-gold-border)] bg-[var(--docs-gold-bg)] p-5">
                <p className="text-sm font-semibold text-[var(--docs-text-primary)]">Submitted does not mean Paid.</p>
                <p className="mt-2 text-sm leading-6 text-[var(--docs-text-body)]">Arklake only marks an invoice as paid after the payment has been verified.</p>
              </div>
            </div>
          </section>

          <section className="grid min-w-0 grid-cols-1 gap-4 py-10 sm:grid-cols-[2.75rem_minmax(0,1fr)] sm:gap-4" aria-labelledby="invoicing-05">
            <p className="text-sm font-semibold tracking-[0.18em] text-[var(--docs-aqua)]">05</p>
            <div className="min-w-0">
              <h2 id="invoicing-05" className="text-2xl font-semibold tracking-[-0.04em] text-[var(--docs-text-primary)]">What to read next</h2>
              <div className="mt-6 grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-3">
                {invoicingNextCards.map(([title, description]) => (
                  <a key={title} className="rounded-[1.35rem] border border-[color:var(--docs-border)] bg-[var(--docs-surface)] p-5 shadow-[var(--docs-shadow-card)] transition hover:border-[color:var(--docs-border-strong)]" href={getDocsRoute(title)}>
                    <h3 className="text-lg font-semibold tracking-[-0.025em] text-[var(--docs-text-primary)]">{title}</h3>
                    <p className="mt-2 text-sm leading-6 text-[var(--docs-text-body)]">{description}</p>
                  </a>
                ))}
              </div>
            </div>
          </section>
        </div>
      </article>
    </DocsShell>
  )
}

function PaymentsPage() {
  return (
    <DocsShell>
      <DocsBreadcrumb current="Payments" />
      <article className={`${shellWidth} pb-16 pt-10 sm:pb-20 sm:pt-12 lg:pb-24`}>
        <header className="max-w-3xl min-w-0 border-b border-[color:var(--docs-border)] pb-10">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--docs-aqua)]">Payments</p>
          <h1 className="mt-4 text-[2.2rem] font-semibold leading-[1.06] tracking-[-0.055em] text-[var(--docs-text-primary)] sm:text-5xl">
            Pay invoices with Arklake
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-[var(--docs-text-body)] sm:text-lg sm:leading-8">
            Choose how to pay, submit the transaction and wait for Arklake to verify the payment before the invoice is marked as paid.
          </p>
        </header>

        <div className="max-w-3xl min-w-0 divide-y divide-[color:var(--docs-border)]">
          <section className="grid min-w-0 grid-cols-1 gap-4 py-10 sm:grid-cols-[2.75rem_minmax(0,1fr)] sm:gap-4" aria-labelledby="payments-01">
            <p className="text-sm font-semibold tracking-[0.18em] text-[var(--docs-aqua)]">01</p>
            <div className="min-w-0">
              <h2 id="payments-01" className="text-2xl font-semibold tracking-[-0.04em] text-[var(--docs-text-primary)]">Open the invoice</h2>
              <p className="mt-4 text-base leading-7 text-[var(--docs-text-body)]">The payer opens the invoice from the secure link they received.</p>
              <p className="mt-4 text-base leading-7 text-[var(--docs-text-body)]">Before paying, review:</p>
              <ul className="mt-5 grid min-w-0 grid-cols-1 gap-3 text-base leading-7 text-[var(--docs-text-body)] sm:grid-cols-2">
                {['Recipient', 'Amount', 'Payment description', 'Expiry'].map((item) => (
                  <li key={item} className="flex min-w-0 gap-3">
                    <span className="mt-3 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--docs-aqua)]" aria-hidden="true" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-5 text-base leading-7 text-[var(--docs-text-body)]">The invoice should make it clear what is being paid and who will receive the payment.</p>
            </div>
          </section>

          <section className="grid min-w-0 grid-cols-1 gap-4 py-10 sm:grid-cols-[2.75rem_minmax(0,1fr)] sm:gap-4" aria-labelledby="payments-02">
            <p className="text-sm font-semibold tracking-[0.18em] text-[var(--docs-aqua)]">02</p>
            <div className="min-w-0">
              <h2 id="payments-02" className="text-2xl font-semibold tracking-[-0.04em] text-[var(--docs-text-primary)]">Choose how to pay</h2>
              <p className="mt-4 text-base leading-7 text-[var(--docs-text-body)]">Arklake is designed to support more than one way to complete an invoice payment.</p>
              <div className="mt-6 grid min-w-0 grid-cols-1 gap-4 md:grid-cols-3">
                {paymentMethods.map(([title, description]) => (
                  <div key={title} className="rounded-[1.35rem] border border-[color:var(--docs-border)] bg-[var(--docs-surface)] p-5 shadow-[var(--docs-shadow-card)]">
                    <h3 className="text-base font-semibold tracking-[-0.02em] text-[var(--docs-text-primary)]">{title}</h3>
                    <p className="mt-2 text-sm leading-6 text-[var(--docs-text-body)]">{description}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="grid min-w-0 grid-cols-1 gap-4 py-10 sm:grid-cols-[2.75rem_minmax(0,1fr)] sm:gap-4" aria-labelledby="payments-03">
            <p className="text-sm font-semibold tracking-[0.18em] text-[var(--docs-aqua)]">03</p>
            <div className="min-w-0">
              <h2 id="payments-03" className="text-2xl font-semibold tracking-[-0.04em] text-[var(--docs-text-primary)]">Review the payment</h2>
              <p className="mt-4 text-base leading-7 text-[var(--docs-text-body)]">Before submitting, the payer should be able to review the important payment details.</p>
              <ul className="mt-5 grid min-w-0 grid-cols-1 gap-3 text-base leading-7 text-[var(--docs-text-body)] sm:grid-cols-2">
                {['Recipient', 'Amount', 'Payment reference or description', 'Any applicable fee information when available'].map((item) => (
                  <li key={item} className="flex min-w-0 gap-3">
                    <span className="mt-3 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--docs-aqua)]" aria-hidden="true" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <section className="grid min-w-0 grid-cols-1 gap-4 py-10 sm:grid-cols-[2.75rem_minmax(0,1fr)] sm:gap-4" aria-labelledby="payments-04">
            <p className="text-sm font-semibold tracking-[0.18em] text-[var(--docs-aqua)]">04</p>
            <div className="min-w-0">
              <h2 id="payments-04" className="text-2xl font-semibold tracking-[-0.04em] text-[var(--docs-text-primary)]">Submit the payment</h2>
              <div className="mt-4 space-y-4 text-base leading-7 text-[var(--docs-text-body)]">
                <p>The payer approves and submits the transaction using the selected payment method.</p>
                <p>Submitting a transaction does not mean the invoice has been paid.</p>
                <p>After submission, Arklake still needs to verify the payment result.</p>
              </div>
            </div>
          </section>

          <section className="grid min-w-0 grid-cols-1 gap-4 py-10 sm:grid-cols-[2.75rem_minmax(0,1fr)] sm:gap-4" aria-labelledby="payments-05">
            <p className="text-sm font-semibold tracking-[0.18em] text-[var(--docs-aqua)]">05</p>
            <div className="min-w-0">
              <h2 id="payments-05" className="text-2xl font-semibold tracking-[-0.04em] text-[var(--docs-text-primary)]">Payment verification</h2>
              <p className="mt-4 text-base leading-7 text-[var(--docs-text-body)]">Arklake verifies the payment before marking the invoice as paid.</p>
              <p className="mt-4 text-base leading-7 text-[var(--docs-text-body)]">At a user-facing level, verification should confirm that the payment matches the invoice requirements.</p>
              <ul className="mt-5 grid min-w-0 grid-cols-1 gap-3 text-base leading-7 text-[var(--docs-text-body)] sm:grid-cols-2">
                {['Correct recipient', 'Correct amount', 'Expected payment asset', 'Invoice still valid', 'Payment has not already been used for the same invoice'].map((item) => (
                  <li key={item} className="flex min-w-0 gap-3">
                    <span className="mt-3 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--docs-aqua)]" aria-hidden="true" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-6 rounded-[1.35rem] border border-[color:var(--docs-gold-border)] bg-[var(--docs-gold-bg)] p-5">
                <p className="text-sm font-semibold text-[var(--docs-text-primary)]">Submitted does not mean Paid.</p>
                <p className="mt-2 text-sm leading-6 text-[var(--docs-text-body)]">An invoice should only be treated as paid after the payment has been successfully verified.</p>
              </div>
            </div>
          </section>

          <section className="grid min-w-0 grid-cols-1 gap-4 py-10 sm:grid-cols-[2.75rem_minmax(0,1fr)] sm:gap-4" aria-labelledby="payments-06">
            <p className="text-sm font-semibold tracking-[0.18em] text-[var(--docs-aqua)]">06</p>
            <div className="min-w-0">
              <h2 id="payments-06" className="text-2xl font-semibold tracking-[-0.04em] text-[var(--docs-text-primary)]">Payment complete</h2>
              <div className="mt-4 space-y-4 text-base leading-7 text-[var(--docs-text-body)]">
                <p>After successful verification, the invoice can be shown as Paid.</p>
                <p>The payer and seller should then be able to review the payment result and transaction evidence.</p>
              </div>
            </div>
          </section>

          <section className="grid min-w-0 grid-cols-1 gap-4 py-10 sm:grid-cols-[2.75rem_minmax(0,1fr)] sm:gap-4" aria-labelledby="payments-07">
            <p className="text-sm font-semibold tracking-[0.18em] text-[var(--docs-aqua)]">07</p>
            <div className="min-w-0">
              <h2 id="payments-07" className="text-2xl font-semibold tracking-[-0.04em] text-[var(--docs-text-primary)]">What to read next</h2>
              <div className="mt-6 grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
                {paymentsNextCards.map(([title, description]) => (
                  <a key={title} className="rounded-[1.35rem] border border-[color:var(--docs-border)] bg-[var(--docs-surface)] p-5 shadow-[var(--docs-shadow-card)] transition hover:border-[color:var(--docs-border-strong)]" href={getDocsRoute(title)}>
                    <h3 className="text-lg font-semibold tracking-[-0.025em] text-[var(--docs-text-primary)]">{title}</h3>
                    <p className="mt-2 text-sm leading-6 text-[var(--docs-text-body)]">{description}</p>
                  </a>
                ))}
              </div>
            </div>
          </section>
        </div>
      </article>
    </DocsShell>
  )
}

function WalletPage() {
  return (
    <DocsShell>
      <DocsBreadcrumb current="Wallet" />
      <article className={`${shellWidth} pb-16 pt-10 sm:pb-20 sm:pt-12 lg:pb-24`}>
        <header className="max-w-3xl min-w-0 border-b border-[color:var(--docs-border)] pb-10">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--docs-aqua)]">Wallet</p>
          <h1 className="mt-4 text-[2.2rem] font-semibold leading-[1.06] tracking-[-0.055em] text-[var(--docs-text-primary)] sm:text-5xl">
            Manage your stablecoins with Arklake
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-[var(--docs-text-body)] sm:text-lg sm:leading-8">
            Receive, send and manage your balance from one Arklake account.
          </p>
        </header>

        <div className="max-w-3xl min-w-0 divide-y divide-[color:var(--docs-border)]">
          <section className="grid min-w-0 grid-cols-1 gap-4 py-10 sm:grid-cols-[2.75rem_minmax(0,1fr)] sm:gap-4" aria-labelledby="wallet-01">
            <p className="text-sm font-semibold tracking-[0.18em] text-[var(--docs-aqua)]">01</p>
            <div className="min-w-0">
              <h2 id="wallet-01" className="text-2xl font-semibold tracking-[-0.04em] text-[var(--docs-text-primary)]">Your wallet</h2>
              <div className="mt-4 space-y-4 text-base leading-7 text-[var(--docs-text-body)]">
                <p>Wallet is the area where you view and manage assets used in Arklake.</p>
                <p>Arklake presents this as part of the account experience, so users can focus on receiving, sending and paying without starting from infrastructure details.</p>
              </div>
            </div>
          </section>

          <section className="grid min-w-0 grid-cols-1 gap-4 py-10 sm:grid-cols-[2.75rem_minmax(0,1fr)] sm:gap-4" aria-labelledby="wallet-02">
            <p className="text-sm font-semibold tracking-[0.18em] text-[var(--docs-aqua)]">02</p>
            <div className="min-w-0">
              <h2 id="wallet-02" className="text-2xl font-semibold tracking-[-0.04em] text-[var(--docs-text-primary)]">Understand your balance</h2>
              <p className="mt-4 text-base leading-7 text-[var(--docs-text-body)]">
                The current Arklake interface shows an available balance for payment use.
              </p>
            </div>
          </section>

          <section className="grid min-w-0 grid-cols-1 gap-4 py-10 sm:grid-cols-[2.75rem_minmax(0,1fr)] sm:gap-4" aria-labelledby="wallet-03">
            <p className="text-sm font-semibold tracking-[0.18em] text-[var(--docs-aqua)]">03</p>
            <div className="min-w-0">
              <h2 id="wallet-03" className="text-2xl font-semibold tracking-[-0.04em] text-[var(--docs-text-primary)]">Receive</h2>
              <p className="mt-4 text-base leading-7 text-[var(--docs-text-body)]">
                Receive lets you receive supported assets through your Arklake account.
              </p>
              <p className="mt-4 text-base leading-7 text-[var(--docs-text-body)]">
                The receiving flow should show the information a payer or sender needs before funds are sent.
              </p>
            </div>
          </section>

          <section className="grid min-w-0 grid-cols-1 gap-4 py-10 sm:grid-cols-[2.75rem_minmax(0,1fr)] sm:gap-4" aria-labelledby="wallet-04">
            <p className="text-sm font-semibold tracking-[0.18em] text-[var(--docs-aqua)]">04</p>
            <div className="min-w-0">
              <h2 id="wallet-04" className="text-2xl font-semibold tracking-[-0.04em] text-[var(--docs-text-primary)]">Send</h2>
              <p className="mt-4 text-base leading-7 text-[var(--docs-text-body)]">A send flow should let the user choose a recipient, choose an amount, review the details and approve the send action.</p>
              <div className="mt-6 rounded-[1.35rem] border border-[color:var(--docs-gold-border)] bg-[var(--docs-gold-bg)] p-5">
                <p className="text-sm font-semibold text-[var(--docs-text-primary)]">User confirmation comes first.</p>
                <p className="mt-2 text-sm leading-6 text-[var(--docs-text-body)]">Arklake should not automatically spend, convert, bridge or route funds without explicit user confirmation.</p>
              </div>
            </div>
          </section>

          <section className="grid min-w-0 grid-cols-1 gap-4 py-10 sm:grid-cols-[2.75rem_minmax(0,1fr)] sm:gap-4" aria-labelledby="wallet-05">
            <p className="text-sm font-semibold tracking-[0.18em] text-[var(--docs-aqua)]">05</p>
            <div className="min-w-0">
              <h2 id="wallet-05" className="text-2xl font-semibold tracking-[-0.04em] text-[var(--docs-text-primary)]">Swap and payments</h2>
              <div className="mt-4 space-y-4 text-base leading-7 text-[var(--docs-text-body)]">
                <p>Wallet is where you manage balances, receive and send.</p>
                <p>Swap is for converting supported assets.</p>
                <p>Payments are for paying invoices.</p>
              </div>
            </div>
          </section>

          <section className="grid min-w-0 grid-cols-1 gap-4 py-10 sm:grid-cols-[2.75rem_minmax(0,1fr)] sm:gap-4" aria-labelledby="wallet-06">
            <p className="text-sm font-semibold tracking-[0.18em] text-[var(--docs-aqua)]">06</p>
            <div className="min-w-0">
              <h2 id="wallet-06" className="text-2xl font-semibold tracking-[-0.04em] text-[var(--docs-text-primary)]">What to read next</h2>
              <div className="mt-6 grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
                {walletNextCards.map(([title, description]) => (
                  <a key={title} className="rounded-[1.35rem] border border-[color:var(--docs-border)] bg-[var(--docs-surface)] p-5 shadow-[var(--docs-shadow-card)] transition hover:border-[color:var(--docs-border-strong)]" href={getDocsRoute(title)}>
                    <h3 className="text-lg font-semibold tracking-[-0.025em] text-[var(--docs-text-primary)]">{title}</h3>
                    <p className="mt-2 text-sm leading-6 text-[var(--docs-text-body)]">{description}</p>
                  </a>
                ))}
              </div>
            </div>
          </section>
        </div>
      </article>
    </DocsShell>
  )
}

function SwapPage() {
  return (
    <DocsShell>
      <DocsBreadcrumb current="Swap" />
      <article className={`${shellWidth} pb-16 pt-10 sm:pb-20 sm:pt-12 lg:pb-24`}>
        <header className="max-w-3xl min-w-0 border-b border-[color:var(--docs-border)] pb-10">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--docs-aqua)]">Swap</p>
          <h1 className="mt-4 text-[2.2rem] font-semibold leading-[1.06] tracking-[-0.055em] text-[var(--docs-text-primary)] sm:text-5xl">
            Convert supported assets with Arklake
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-[var(--docs-text-body)] sm:text-lg sm:leading-8">
            Learn how Arklake is designed to convert supported assets to USDC through a simple review-and-confirm flow.
          </p>
        </header>

        <div className="max-w-3xl min-w-0 divide-y divide-[color:var(--docs-border)]">
          <section className="grid min-w-0 grid-cols-1 gap-4 py-10 sm:grid-cols-[2.75rem_minmax(0,1fr)] sm:gap-4" aria-labelledby="swap-01">
            <p className="text-sm font-semibold tracking-[0.18em] text-[var(--docs-aqua)]">01</p>
            <div className="min-w-0">
              <h2 id="swap-01" className="text-2xl font-semibold tracking-[-0.04em] text-[var(--docs-text-primary)]">Choose what to swap</h2>
              <p className="mt-4 text-base leading-7 text-[var(--docs-text-body)]">Swap is for converting one supported asset into another supported asset.</p>
              <p className="mt-4 text-base leading-7 text-[var(--docs-text-body)]">Arklake is especially focused on helping users convert supported assets to USDC for payment flows.</p>
            </div>
          </section>

          <section className="grid min-w-0 grid-cols-1 gap-4 py-10 sm:grid-cols-[2.75rem_minmax(0,1fr)] sm:gap-4" aria-labelledby="swap-02">
            <p className="text-sm font-semibold tracking-[0.18em] text-[var(--docs-aqua)]">02</p>
            <div className="min-w-0">
              <h2 id="swap-02" className="text-2xl font-semibold tracking-[-0.04em] text-[var(--docs-text-primary)]">Enter the amount</h2>
              <p className="mt-4 text-base leading-7 text-[var(--docs-text-body)]">Choose the amount you want to convert before reviewing the swap.</p>
            </div>
          </section>

          <section className="grid min-w-0 grid-cols-1 gap-4 py-10 sm:grid-cols-[2.75rem_minmax(0,1fr)] sm:gap-4" aria-labelledby="swap-03">
            <p className="text-sm font-semibold tracking-[0.18em] text-[var(--docs-aqua)]">03</p>
            <div className="min-w-0">
              <h2 id="swap-03" className="text-2xl font-semibold tracking-[-0.04em] text-[var(--docs-text-primary)]">Review the swap</h2>
              <p className="mt-4 text-base leading-7 text-[var(--docs-text-body)]">Before confirming, the review step should make the important swap details clear.</p>
              <ul className="mt-5 grid min-w-0 grid-cols-1 gap-3 text-base leading-7 text-[var(--docs-text-body)] sm:grid-cols-2">
                {['Asset being converted', 'Asset being received', 'Amount', 'Quote or exchange rate when available', 'Applicable fee information when available', 'Estimated amount received when available'].map((item) => (
                  <li key={item} className="flex min-w-0 gap-3">
                    <span className="mt-3 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--docs-aqua)]" aria-hidden="true" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <section className="grid min-w-0 grid-cols-1 gap-4 py-10 sm:grid-cols-[2.75rem_minmax(0,1fr)] sm:gap-4" aria-labelledby="swap-04">
            <p className="text-sm font-semibold tracking-[0.18em] text-[var(--docs-aqua)]">04</p>
            <div className="min-w-0">
              <h2 id="swap-04" className="text-2xl font-semibold tracking-[-0.04em] text-[var(--docs-text-primary)]">Confirm the swap</h2>
              <p className="mt-4 text-base leading-7 text-[var(--docs-text-body)]">The user reviews the swap and explicitly approves before it is submitted.</p>
              <div className="mt-6 rounded-[1.35rem] border border-[color:var(--docs-gold-border)] bg-[var(--docs-gold-bg)] p-5">
                <p className="text-sm font-semibold text-[var(--docs-text-primary)]">User confirmation comes first.</p>
                <p className="mt-2 text-sm leading-6 text-[var(--docs-text-body)]">Arklake should not convert, bridge or route funds without explicit user confirmation.</p>
              </div>
            </div>
          </section>

          <section className="grid min-w-0 grid-cols-1 gap-4 py-10 sm:grid-cols-[2.75rem_minmax(0,1fr)] sm:gap-4" aria-labelledby="swap-05">
            <p className="text-sm font-semibold tracking-[0.18em] text-[var(--docs-aqua)]">05</p>
            <div className="min-w-0">
              <h2 id="swap-05" className="text-2xl font-semibold tracking-[-0.04em] text-[var(--docs-text-primary)]">Swap complete</h2>
              <p className="mt-4 text-base leading-7 text-[var(--docs-text-body)]">After a successful swap, the resulting asset should be reflected in the user's balance.</p>
              <div className="mt-6 rounded-[1.35rem] border border-[color:var(--docs-gold-border)] bg-[var(--docs-gold-bg)] p-5">
                <p className="text-sm font-semibold text-[var(--docs-text-primary)]">Swapping does not pay an invoice.</p>
                <p className="mt-2 text-sm leading-6 text-[var(--docs-text-body)]">A swap changes the asset. Paying an invoice remains a separate payment action.</p>
              </div>
            </div>
          </section>

          <section className="grid min-w-0 grid-cols-1 gap-4 py-10 sm:grid-cols-[2.75rem_minmax(0,1fr)] sm:gap-4" aria-labelledby="swap-06">
            <p className="text-sm font-semibold tracking-[0.18em] text-[var(--docs-aqua)]">06</p>
            <div className="min-w-0">
              <h2 id="swap-06" className="text-2xl font-semibold tracking-[-0.04em] text-[var(--docs-text-primary)]">Swap, Wallet and Payments</h2>
              <div className="mt-4 space-y-4 text-base leading-7 text-[var(--docs-text-body)]">
                <p>Wallet is where you manage balances, receive and send.</p>
                <p>Swap is for converting supported assets.</p>
                <p>Payments are for paying invoices.</p>
              </div>
            </div>
          </section>

          <section className="grid min-w-0 grid-cols-1 gap-4 py-10 sm:grid-cols-[2.75rem_minmax(0,1fr)] sm:gap-4" aria-labelledby="swap-07">
            <p className="text-sm font-semibold tracking-[0.18em] text-[var(--docs-aqua)]">07</p>
            <div className="min-w-0">
              <h2 id="swap-07" className="text-2xl font-semibold tracking-[-0.04em] text-[var(--docs-text-primary)]">What to read next</h2>
              <div className="mt-6 grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
                {swapNextCards.map(([title, description]) => (
                  <a key={title} className="rounded-[1.35rem] border border-[color:var(--docs-border)] bg-[var(--docs-surface)] p-5 shadow-[var(--docs-shadow-card)] transition hover:border-[color:var(--docs-border-strong)]" href={getDocsRoute(title)}>
                    <h3 className="text-lg font-semibold tracking-[-0.025em] text-[var(--docs-text-primary)]">{title}</h3>
                    <p className="mt-2 text-sm leading-6 text-[var(--docs-text-body)]">{description}</p>
                  </a>
                ))}
              </div>
            </div>
          </section>
        </div>
      </article>
    </DocsShell>
  )
}

function TechnicalPage() {
  return (
    <DocsShell>
      <DocsBreadcrumb current="Technical" />
      <article className={`${shellWidth} pb-16 pt-10 sm:pb-20 sm:pt-12 lg:pb-24`}>
        <header className="max-w-3xl min-w-0 border-b border-[color:var(--docs-border)] pb-10">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--docs-aqua)]">Technical</p>
          <h1 className="mt-4 text-[2.2rem] font-semibold leading-[1.06] tracking-[-0.055em] text-[var(--docs-text-primary)] sm:text-5xl">
            How Arklake is designed to work
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-[var(--docs-text-body)] sm:text-lg sm:leading-8">
            Understand the account, payment and infrastructure model behind Arklake.
          </p>
          <div className="mt-7 rounded-[1.35rem] border border-[color:var(--docs-gold-border)] bg-[var(--docs-gold-bg)] p-5">
            <p className="text-sm font-semibold text-[var(--docs-text-primary)]">Implementation status</p>
            <p className="mt-2 text-sm leading-6 text-[var(--docs-text-body)]">Arklake is currently being developed. This page describes the technical model the product is designed around. Infrastructure capabilities referenced here should not be interpreted as confirmation that every integration is currently live.</p>
          </div>
        </header>

        <div className="max-w-3xl min-w-0 divide-y divide-[color:var(--docs-border)]">
          <section className="grid min-w-0 grid-cols-1 gap-4 py-10 sm:grid-cols-[2.75rem_minmax(0,1fr)] sm:gap-4" aria-labelledby="technical-01">
            <p className="text-sm font-semibold tracking-[0.18em] text-[var(--docs-aqua)]">01</p>
            <div className="min-w-0">
              <h2 id="technical-01" className="text-2xl font-semibold tracking-[-0.04em] text-[var(--docs-text-primary)]">Account and wallet</h2>
              <div className="mt-4 space-y-4 text-base leading-7 text-[var(--docs-text-body)]">
                <p>Arklake is designed around an account-first experience.</p>
                <p>The user interacts with an Arklake account while wallet infrastructure can operate underneath the product experience.</p>
                <p>Circle wallet infrastructure is relevant to the architecture Arklake is evaluating, but this page does not claim that Circle User-Controlled Wallets are currently integrated.</p>
              </div>
            </div>
          </section>

          <section className="grid min-w-0 grid-cols-1 gap-4 py-10 sm:grid-cols-[2.75rem_minmax(0,1fr)] sm:gap-4" aria-labelledby="technical-02">
            <p className="text-sm font-semibold tracking-[0.18em] text-[var(--docs-aqua)]">02</p>
            <div className="min-w-0">
              <h2 id="technical-02" className="text-2xl font-semibold tracking-[-0.04em] text-[var(--docs-text-primary)]">Payment lifecycle</h2>
              <p className="mt-4 text-base leading-7 text-[var(--docs-text-body)]">The Arklake payment model is designed around a clear lifecycle: invoice, review, submit payment, verify and paid.</p>
              <div className="mt-6 rounded-[1.35rem] border border-[color:var(--docs-gold-border)] bg-[var(--docs-gold-bg)] p-5">
                <p className="text-sm font-semibold text-[var(--docs-text-primary)]">Submitted does not mean Paid.</p>
                <p className="mt-2 text-sm leading-6 text-[var(--docs-text-body)]">Payment submission and payment verification are separate stages in the Arklake model.</p>
              </div>
            </div>
          </section>

          <section className="grid min-w-0 grid-cols-1 gap-4 py-10 sm:grid-cols-[2.75rem_minmax(0,1fr)] sm:gap-4" aria-labelledby="technical-03">
            <p className="text-sm font-semibold tracking-[0.18em] text-[var(--docs-aqua)]">03</p>
            <div className="min-w-0">
              <h2 id="technical-03" className="text-2xl font-semibold tracking-[-0.04em] text-[var(--docs-text-primary)]">Payment verification</h2>
              <p className="mt-4 text-base leading-7 text-[var(--docs-text-body)]">Arklake's verification model is designed to check whether a submitted payment satisfies the invoice requirements.</p>
              <ul className="mt-5 grid min-w-0 grid-cols-1 gap-3 text-base leading-7 text-[var(--docs-text-body)] sm:grid-cols-2">
                {['Correct recipient', 'Correct amount', 'Expected payment asset', 'Invoice still valid', 'Payment has not already been used for the same invoice'].map((item) => (
                  <li key={item} className="flex min-w-0 gap-3">
                    <span className="mt-3 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--docs-aqua)]" aria-hidden="true" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <section className="grid min-w-0 grid-cols-1 gap-4 py-10 sm:grid-cols-[2.75rem_minmax(0,1fr)] sm:gap-4" aria-labelledby="technical-04">
            <p className="text-sm font-semibold tracking-[0.18em] text-[var(--docs-aqua)]">04</p>
            <div className="min-w-0">
              <h2 id="technical-04" className="text-2xl font-semibold tracking-[-0.04em] text-[var(--docs-text-primary)]">Arc settlement</h2>
              <div className="mt-4 space-y-4 text-base leading-7 text-[var(--docs-text-body)]">
                <p>Arc is the blockchain infrastructure Arklake is being designed around for stablecoin payment settlement and on-chain transaction evidence.</p>
                <p>Official Arc documentation describes Arc as an open Layer-1 blockchain purpose-built for programmable money, with USDC as the native gas token, EVM compatibility and sub-second deterministic finality.</p>
                <p>On-chain transaction evidence can support payment verification and reconciliation, but this page does not claim that Arklake currently settles live transactions on Arc.</p>
              </div>
            </div>
          </section>

          <section className="grid min-w-0 grid-cols-1 gap-4 py-10 sm:grid-cols-[2.75rem_minmax(0,1fr)] sm:gap-4" aria-labelledby="technical-05">
            <p className="text-sm font-semibold tracking-[0.18em] text-[var(--docs-aqua)]">05</p>
            <div className="min-w-0">
              <h2 id="technical-05" className="text-2xl font-semibold tracking-[-0.04em] text-[var(--docs-text-primary)]">Circle and USDC</h2>
              <div className="mt-4 space-y-4 text-base leading-7 text-[var(--docs-text-body)]">
                <p>USDC is the primary payment asset Arklake is designed around.</p>
                <p>Circle provides wallet and USDC infrastructure relevant to the intended Arklake architecture.</p>
                <p>Circle User-Controlled Wallets are infrastructure Arklake can evaluate for its architecture, not a current integration claim on this page.</p>
              </div>
            </div>
          </section>

          <section className="grid min-w-0 grid-cols-1 gap-4 py-10 sm:grid-cols-[2.75rem_minmax(0,1fr)] sm:gap-4" aria-labelledby="technical-06">
            <p className="text-sm font-semibold tracking-[0.18em] text-[var(--docs-aqua)]">06</p>
            <div className="min-w-0">
              <h2 id="technical-06" className="text-2xl font-semibold tracking-[-0.04em] text-[var(--docs-text-primary)]">Unified Balance and funding</h2>
              <div className="mt-4 space-y-4 text-base leading-7 text-[var(--docs-text-body)]">
                <p>Official Arc documentation describes Unified Balance as USDC balance and spending infrastructure built on Circle Gateway that can provide a chain-agnostic view of eligible USDC.</p>
                <p>Arklake is exploring this infrastructure for future funding and Available to pay behavior.</p>
                <p>Swap is not Unified Balance. Unified Balance is not an ordinary wallet balance. Gateway is not a user-facing Arklake menu. Paying an invoice remains a separate action.</p>
              </div>
            </div>
          </section>

          <section className="grid min-w-0 grid-cols-1 gap-4 py-10 sm:grid-cols-[2.75rem_minmax(0,1fr)] sm:gap-4" aria-labelledby="technical-07">
            <p className="text-sm font-semibold tracking-[0.18em] text-[var(--docs-aqua)]">07</p>
            <div className="min-w-0">
              <h2 id="technical-07" className="text-2xl font-semibold tracking-[-0.04em] text-[var(--docs-text-primary)]">Payment references</h2>
              <div className="mt-4 space-y-4 text-base leading-7 text-[var(--docs-text-body)]">
                <p>Invoices benefit from a payment reference or description that helps connect a payment with its business context.</p>
                <p>Arc provides Memo infrastructure for attaching data to supported payment interactions, which can help with payment correlation and reconciliation.</p>
                <p>Arklake does not currently claim an implemented Arc Memo integration.</p>
              </div>
            </div>
          </section>

          <section className="grid min-w-0 grid-cols-1 gap-4 py-10 sm:grid-cols-[2.75rem_minmax(0,1fr)] sm:gap-4" aria-labelledby="technical-08">
            <p className="text-sm font-semibold tracking-[0.18em] text-[var(--docs-aqua)]">08</p>
            <div className="min-w-0">
              <h2 id="technical-08" className="text-2xl font-semibold tracking-[-0.04em] text-[var(--docs-text-primary)]">Architecture boundaries</h2>
              <div className="mt-6 grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
                {technicalBoundaries.map(([title, description]) => (
                  <a key={title} className="rounded-[1.35rem] border border-[color:var(--docs-border)] bg-[var(--docs-surface)] p-5 shadow-[var(--docs-shadow-card)] transition hover:border-[color:var(--docs-border-strong)]" href={getDocsRoute(title)}>
                    <h3 className="text-lg font-semibold tracking-[-0.025em] text-[var(--docs-text-primary)]">{title}</h3>
                    <p className="mt-2 text-sm leading-6 text-[var(--docs-text-body)]">{description}</p>
                  </a>
                ))}
              </div>
            </div>
          </section>

          <section className="grid min-w-0 grid-cols-1 gap-4 py-10 sm:grid-cols-[2.75rem_minmax(0,1fr)] sm:gap-4" aria-labelledby="technical-09">
            <p className="text-sm font-semibold tracking-[0.18em] text-[var(--docs-aqua)]">09</p>
            <div className="min-w-0">
              <h2 id="technical-09" className="text-2xl font-semibold tracking-[-0.04em] text-[var(--docs-text-primary)]">What to read next</h2>
              <div className="mt-6 grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
                {technicalNextCards.map(([title, description]) => (
                  <div key={title} className="rounded-[1.35rem] border border-[color:var(--docs-border)] bg-[var(--docs-surface)] p-5 shadow-[var(--docs-shadow-card)]">
                    <h3 className="text-lg font-semibold tracking-[-0.025em] text-[var(--docs-text-primary)]">{title}</h3>
                    <p className="mt-2 text-sm leading-6 text-[var(--docs-text-body)]">{description}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      </article>
    </DocsShell>
  )
}

function TrustIcon() {
  return (
    <svg className="h-3.5 w-3.5 flex-none text-arklake-aqua" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.7" />
      <path d="M5.25 8.1 7.05 9.9l3.8-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function FlowCue() {
  return (
    <div className="flex items-center gap-3 px-3 py-2" aria-hidden="true">
      <span className="h-px flex-1 bg-arklake-aqua/25" />
      <span className="flex h-8 w-8 items-center justify-center rounded-full border border-arklake-aqua/45 bg-aqua-mist text-arklake-aqua shadow-[0_0_0_6px_rgba(50,199,193,0.10)]">
        <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
          <path d="M3 8h9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          <path d="m9 5 3 3-3 3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span className="h-px flex-1 bg-arklake-aqua/25" />
    </div>
  )
}

function PaymentVisual() {
  return (
    <div className="relative mx-auto w-full min-w-0 max-w-full sm:max-w-[620px] lg:ml-auto lg:mr-0" aria-label="Arklake payment flow visual">
      <div className="relative w-full min-w-0 max-w-full rounded-[2rem] border border-lake-border bg-surface p-3 shadow-[0_30px_86px_rgba(20,33,39,0.13)] sm:rounded-[2.25rem] sm:p-5 lg:origin-center lg:scale-[1.04]">
        <div className="w-full min-w-0 max-w-full overflow-hidden rounded-[1.75rem] border border-lake-border bg-lake-canvas p-4 sm:p-6">
          <div className="mb-6 flex min-w-0 items-start justify-between gap-3 sm:gap-5">
            <div>
              <p className="text-[0.65rem] font-medium uppercase tracking-[0.18em] text-slate sm:text-xs sm:tracking-[0.22em]">Account balance</p>
              <p className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-arklake-ink sm:text-5xl">12,480 USDC</p>
            </div>
            <div className="shrink-0 rounded-full border border-arklake-aqua/30 bg-aqua-mist px-2.5 py-1 text-xs font-medium text-arklake-ink sm:px-3 sm:text-sm">
              USDC
            </div>
          </div>

          <div className="rounded-3xl border border-arklake-gold/35 bg-arklake-gold/10 p-4 sm:p-5">
            <div className="flex min-w-0 items-start justify-between gap-3 sm:gap-5">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-deep-text">Invoice received</p>
                <p className="mt-1 text-xs text-slate sm:text-sm">Global payment account</p>
              </div>
              <p className="shrink-0 text-sm font-semibold text-arklake-ink sm:text-base">+2,400</p>
            </div>
          </div>

          <FlowCue />

          <div className="rounded-3xl border border-arklake-aqua/25 bg-surface p-4 sm:p-5">
            <div className="flex min-w-0 items-start justify-between gap-3 sm:gap-5">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-deep-text">Payment ready</p>
                <p className="mt-1 text-xs text-slate sm:text-sm">Verified on-chain</p>
              </div>
              <div className="shrink-0 rounded-full bg-aqua-mist px-2 py-1 text-[0.65rem] font-semibold text-arklake-ink sm:flex sm:items-center sm:gap-2 sm:px-3 sm:text-xs">
                <span className="hidden h-1.5 w-1.5 rounded-full bg-arklake-gold sm:inline-flex" />
                Secure
              </div>
            </div>
          </div>

          <div className="mt-5 flex min-w-0 flex-col items-stretch gap-2 rounded-2xl border border-arklake-aqua/25 bg-aqua-mist px-3 py-3 text-xs text-slate sm:flex-row sm:items-center sm:justify-between sm:gap-2 sm:rounded-full sm:px-4 sm:text-sm">
            <span className="min-w-0 truncate">Invoice/payment</span>
            <span className="h-1.5 w-10 shrink-0 rounded-full bg-arklake-aqua sm:w-12" />
            <span className="min-w-0 truncate font-medium text-arklake-ink">Account verified</span>
          </div>
        </div>
      </div>
    </div>
  )
}

const trustItems = ['Self-custody', 'Built on USDC', 'Secured with passkeys', 'On-chain verified']

const featureCards = [
  {
    title: 'Invoicing',
    description: 'Create and send invoices by email. Get paid in USDC.',
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <path d="M6 3.75h8A1.25 1.25 0 0 1 15.25 5v10.75L13 14.5l-2.25 1.25L8.5 14.5l-2.25 1.25V5A1.25 1.25 0 0 1 7.5 3.75Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M8.25 7.5h3.5M8.25 10.25h2.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    ),
    tone: 'gold',
  },
  {
    title: 'Wallet',
    description: 'Receive, send and manage your stablecoins securely.',
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <path d="M4 6.25A2.25 2.25 0 0 1 6.25 4h7.25A2.5 2.5 0 0 1 16 6.5v7A2.5 2.5 0 0 1 13.5 16H6.25A2.25 2.25 0 0 1 4 13.75v-7.5Z" stroke="currentColor" strokeWidth="1.6" />
        <path d="M13 9.25h3v3.5h-3a1.75 1.75 0 1 1 0-3.5Z" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    ),
    tone: 'aqua',
  },
  {
    title: 'Swap',
    description: 'Convert supported assets to USDC in just a few clicks.',
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <path d="M5 7.25h9.25l-2-2M15 12.75H5.75l2 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M4.75 12.75h10.5M15.25 7.25H4.75" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" opacity="0.28" />
      </svg>
    ),
    tone: 'ink',
  },
]

function FeaturesSection() {
  return (
    <section id="product" className={`${shellWidth} scroll-mt-24 pb-24 pt-10 lg:scroll-mt-28 lg:pb-28 lg:pt-12`}>
      <div className="mx-auto max-w-3xl min-w-0 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-arklake-aqua">Everything you need</p>
        <h2 className="mx-auto mt-4 max-w-[17rem] text-[1.9rem] font-semibold leading-[1.05] tracking-[-0.05em] text-arklake-ink sm:max-w-full sm:text-5xl">
          Move and get paid with ease.
        </h2>
        <p className="mx-auto mt-4 max-w-[19rem] text-base leading-7 text-slate sm:text-lg sm:leading-8">
          All the tools you need in one simple account.
        </p>
      </div>

      <div className="mt-12 grid w-full min-w-0 grid-cols-1 gap-5 md:grid-cols-3 lg:gap-6">
        {featureCards.map((card) => {
          const isGold = card.tone === 'gold'
          const isAqua = card.tone === 'aqua'

          return (
            <article id={`product-${card.title.toLowerCase()}`} key={card.title} className="w-full min-w-0 max-w-full overflow-hidden rounded-[2rem] border border-lake-border bg-surface p-6 shadow-[0_18px_54px_rgba(20,33,39,0.07)]">
              <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${isGold ? 'border border-arklake-gold/35 bg-arklake-gold/10 text-arklake-ink' : isAqua ? 'border border-arklake-aqua/30 bg-aqua-mist text-arklake-aqua' : 'border border-lake-border bg-lake-canvas text-arklake-ink'}`}>
                {card.icon}
              </div>
              <h3 className="mt-6 text-xl font-semibold tracking-[-0.03em] text-arklake-ink">{card.title}</h3>
              <p className="mt-3 text-sm leading-6 text-slate md:min-h-[3.5rem]">{card.description}</p>
              <a className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-arklake-ink" href={getDocsRoute(card.title)}>
                Learn more
                <svg className="h-3.5 w-3.5 text-arklake-aqua" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                  <path d="M3 7h7M7.75 4.25 10.5 7 7.75 9.75" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </a>
            </article>
          )
        })}
      </div>
    </section>
  )
}

const sidebarItems = ['Home', 'Invoices', 'Wallet', 'Swap', 'Account']

const invoiceRows = [
  { id: 'INV-104', status: 'Paid' },
  { id: 'INV-103', status: 'Unpaid' },
  { id: 'INV-102', status: 'Unpaid' },
]

function ProductPreviewSection() {
  return (
    <section id="product-preview" className={`${shellWidth} pb-24 pt-4 lg:pb-32 lg:pt-2`}>
      <div className="mx-auto max-w-3xl min-w-0 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-arklake-aqua">See Arklake in action</p>
        <h2 className="mx-auto mt-4 max-w-[20rem] text-[2rem] font-semibold leading-[1.04] tracking-[-0.055em] text-arklake-ink sm:max-w-[46rem] sm:text-5xl">
          Your home for stablecoin payments.
        </h2>
        <p className="mx-auto mt-4 max-w-[20rem] text-base leading-7 text-slate sm:max-w-[42rem] sm:text-lg sm:leading-8">
          Manage invoices, send and receive payments, and access your balance — all in one place.
        </p>
      </div>

      <div className="mx-auto mt-12 w-full min-w-0 max-w-[1080px] rounded-[2rem] border border-lake-border bg-surface p-3 shadow-[0_34px_96px_rgba(20,33,39,0.12)] sm:rounded-[2.5rem] sm:p-4 lg:mt-14">
        <div className="grid min-w-0 grid-cols-1 overflow-hidden rounded-[1.55rem] border border-lake-border bg-lake-canvas sm:rounded-[2rem] lg:grid-cols-[220px_minmax(0,1fr)]">
          <aside className="min-w-0 border-b border-lake-border bg-surface p-4 lg:border-b-0 lg:border-r lg:p-5">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-aqua-mist text-arklake-aqua">
                <svg className="h-5 w-5" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <path d="M5.25 11.5 10 5.25l4.75 6.25v3.25A1.25 1.25 0 0 1 13.5 16h-7a1.25 1.25 0 0 1-1.25-1.25V11.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                  <path d="M8.25 16v-4h3.5v4" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                </svg>
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-arklake-ink">Arklake</p>
                <p className="truncate text-xs text-slate">Payment account</p>
              </div>
            </div>

            <nav className="mt-5 flex min-w-0 gap-2 overflow-hidden lg:block lg:space-y-2" aria-label="Product preview navigation">
              {sidebarItems.map((item) => {
                const isActive = item === 'Home'
                return (
                  <div
                    key={item}
                    className={`min-w-0 shrink rounded-full px-3 py-2 text-xs font-semibold lg:flex lg:w-full lg:items-center lg:rounded-2xl lg:px-4 lg:text-sm ${
                      isActive ? 'bg-aqua-mist text-arklake-ink' : 'text-slate'
                    }`}
                  >
                    <span className="truncate">{item}</span>
                  </div>
                )
              })}
            </nav>
          </aside>

          <div className="min-w-0 p-4 sm:p-5 lg:p-6">
            <div className="flex min-w-0 items-center justify-between gap-3">
              <div className="inline-flex min-w-0 items-center justify-center rounded-full bg-arklake-ink px-4 py-2.5 text-sm font-semibold text-white shadow-sm">
                <span className="truncate">Create invoice</span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-full border border-lake-border bg-surface text-slate" aria-label="Notifications">
                  <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path d="M4.75 6.9a3.25 3.25 0 0 1 6.5 0v2.35l1 1.85h-8.5l1-1.85V6.9Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                    <path d="M6.75 12.15a1.35 1.35 0 0 0 2.5 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-arklake-ink text-sm font-semibold text-white">A</div>
              </div>
            </div>

            <div className="mt-5 grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-5">
              <div className="min-w-0 rounded-[1.75rem] border border-lake-border bg-surface p-5 sm:p-6">
                <p className="text-sm font-medium text-slate">Available to pay</p>
                <p className="mt-3 text-[2.15rem] font-semibold leading-none tracking-[-0.06em] text-arklake-ink sm:text-5xl">1,240.50 USDC</p>
                <p className="mt-3 text-sm text-slate">≈ $1,240.50 USD</p>

                <div className="mt-6 grid min-w-0 grid-cols-3 gap-2 sm:gap-3">
                  {['Receive', 'Send', 'Swap'].map((action, index) => (
                    <div
                      key={action}
                      className={`min-w-0 rounded-2xl border px-2 py-3 text-xs font-semibold sm:text-sm ${
                        index === 0 ? 'border-arklake-aqua/30 bg-aqua-mist text-arklake-ink' : 'border-lake-border bg-lake-canvas text-arklake-ink'
                      }`}
                    >
                      <span className="truncate">{action}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="min-w-0 rounded-[1.75rem] border border-lake-border bg-surface p-5 sm:p-6">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-base font-semibold tracking-[-0.02em] text-arklake-ink">Invoices</h3>
                  <span className="rounded-full bg-lake-canvas px-3 py-1 text-xs font-medium text-slate">3 total</span>
                </div>

                <div className="mt-5 space-y-3">
                  {invoiceRows.map((invoice) => {
                    const isPaid = invoice.status === 'Paid'
                    return (
                      <div key={invoice.id} className="flex min-w-0 items-center justify-between gap-3 rounded-2xl border border-lake-border bg-lake-canvas px-4 py-3">
                        <span className="min-w-0 truncate text-sm font-semibold text-deep-text">{invoice.id}</span>
                        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${isPaid ? 'bg-aqua-mist text-arklake-ink' : 'bg-surface text-slate'}`}>
                          {invoice.status}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

const howItWorksSteps = [
  {
    number: '01',
    title: 'Create invoice',
    description: "Enter the payer's email, amount and payment details.",
    ui: (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-arklake-ink">New invoice</p>
          <span className="rounded-full bg-aqua-mist px-2.5 py-1 text-[0.65rem] font-semibold text-arklake-ink">Draft</span>
        </div>
        <div className="space-y-2 text-xs text-slate">
          <div className="rounded-2xl border border-lake-border bg-lake-canvas px-3 py-2.5"><span className="font-medium text-deep-text">Bill to:</span> alex@mail.com</div>
          <div className="rounded-2xl border border-lake-border bg-lake-canvas px-3 py-2.5"><span className="font-medium text-deep-text">Amount:</span> 125.00 USDC</div>
          <div className="rounded-2xl border border-lake-border bg-lake-canvas px-3 py-2.5"><span className="font-medium text-deep-text">Memo:</span> Website project</div>
        </div>
        <div className="rounded-full bg-arklake-ink px-4 py-2.5 text-center text-xs font-semibold text-white">Create invoice</div>
      </div>
    ),
  },
  {
    number: '02',
    title: 'Payer receives email',
    description: 'They receive the invoice with a secure link to review and pay.',
    ui: (
      <div className="space-y-3">
        <p className="text-sm font-semibold text-arklake-ink">Arklake invoice email</p>
        <div className="rounded-3xl border border-lake-border bg-lake-canvas p-4">
          <p className="text-xs font-medium text-slate">You have a new invoice from Acme Co.</p>
          <p className="mt-3 text-lg font-semibold tracking-[-0.03em] text-arklake-ink">Amount due: 125.00 USDC</p>
          <div className="mt-4 rounded-full bg-aqua-mist px-4 py-2.5 text-center text-xs font-semibold text-arklake-ink">View invoice & pay</div>
        </div>
        <div className="grid grid-cols-2 gap-2 text-[0.7rem] text-slate">
          <span className="rounded-full bg-surface px-3 py-2">Invoice #INV-104</span>
          <span className="rounded-full bg-surface px-3 py-2">Due Aug 12, 2026</span>
        </div>
      </div>
    ),
  },
  {
    number: '03',
    title: 'Choose how to pay',
    description: 'Sign in to Arklake, scan the invoice QR, or connect a wallet.',
    ui: (
      <div className="space-y-3">
        {[
          ['Pay with Arklake', 'Sign in or create account'],
          ['Scan QR', 'Pay with another wallet'],
          ['Connect wallet', 'Pay without an Arklake account'],
        ].map(([label, copy], index) => (
          <div key={label} className={`flex min-w-0 items-center gap-3 rounded-2xl border px-3 py-3 ${index === 0 ? 'border-arklake-aqua/30 bg-aqua-mist' : 'border-lake-border bg-lake-canvas'}`}>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface text-xs font-semibold text-arklake-ink">{index + 1}</span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-arklake-ink">{label}</span>
              <span className="block text-xs leading-4 text-slate">{copy}</span>
            </span>
          </div>
        ))}
      </div>
    ),
  },
  {
    number: '04',
    title: 'Payment verified',
    description: 'Arklake verifies the payment on-chain before the invoice is marked as paid.',
    ui: (
      <div className="space-y-3">
        <div className="rounded-3xl border border-arklake-aqua/30 bg-aqua-mist p-4">
          <p className="text-sm font-semibold text-arklake-ink">Payment verified</p>
          <p className="mt-2 text-xs leading-5 text-slate">125.00 USDC has been paid and verified on-chain.</p>
        </div>
        <div className="space-y-2 text-xs">
          {[
            ['Invoice:', 'INV-104'],
            ['Status:', 'Paid'],
            ['Date', 'Aug 05, 2026 — 10:24 AM'],
            ['Tx hash', '0x7a9...42f'],
          ].map(([label, value]) => (
            <div key={label} className="flex min-w-0 items-center justify-between gap-3 rounded-2xl border border-lake-border bg-lake-canvas px-3 py-2.5">
              <span className="shrink-0 text-slate">{label}</span>
              <span className="min-w-0 truncate font-semibold text-arklake-ink">{value}</span>
            </div>
          ))}
        </div>
      </div>
    ),
  },
]

function HowItWorksSection() {
  return (
    <section id="how-it-works" className={`${shellWidth} scroll-mt-28 pb-24 pt-2 lg:scroll-mt-32 lg:pb-32 lg:pt-0`}>
      <div className="mx-auto max-w-3xl min-w-0 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-arklake-aqua">How it works</p>
        <h2 className="mx-auto mt-4 max-w-[20rem] text-[2rem] font-semibold leading-[1.04] tracking-[-0.055em] text-arklake-ink sm:max-w-[44rem] sm:text-5xl">
          From invoice to payment, simply.
        </h2>
        <p className="mx-auto mt-4 max-w-[20rem] text-base leading-7 text-slate sm:max-w-[40rem] sm:text-lg sm:leading-8">
          Create an invoice and get paid through one straightforward flow.
        </p>
      </div>

      <div className="relative mt-12 grid min-w-0 grid-cols-1 gap-5 lg:mt-14 lg:grid-cols-4 lg:gap-5">
        <div className="absolute left-1/2 top-0 hidden h-px w-[74%] -translate-x-1/2 bg-arklake-aqua/20 lg:block" aria-hidden="true" />
        {howItWorksSteps.map((step, index) => (
          <article key={step.number} className="relative min-w-0 rounded-[2rem] border border-lake-border bg-surface p-5 shadow-[0_18px_54px_rgba(20,33,39,0.07)] sm:p-6">
            <div className="absolute -top-3 left-6 flex h-8 w-8 items-center justify-center rounded-full border border-arklake-aqua/35 bg-aqua-mist text-xs font-semibold text-arklake-ink shadow-[0_0_0_6px_rgba(50,199,193,0.08)]">
              {step.number}
            </div>
            {index < howItWorksSteps.length - 1 ? (
              <div className="absolute -bottom-4 left-1/2 flex h-8 w-8 -translate-x-1/2 items-center justify-center rounded-full border border-arklake-aqua/25 bg-surface text-arklake-aqua lg:-right-6 lg:bottom-auto lg:left-auto lg:top-14 lg:translate-x-0" aria-hidden="true">
                <svg className="h-4 w-4 rotate-90 lg:rotate-0" viewBox="0 0 16 16" fill="none">
                  <path d="M3 8h9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                  <path d="m9 5 3 3-3 3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            ) : null}

            <div className="pt-5">
              <h3 className="text-xl font-semibold tracking-[-0.03em] text-arklake-ink">{step.title}</h3>
              <p className="mt-3 text-sm leading-6 text-slate lg:min-h-[4.5rem]">{step.description}</p>
            </div>
            <div className="mt-6 min-w-0 rounded-[1.6rem] border border-lake-border bg-surface p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]">
              {step.ui}
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

const infrastructureCards = [
  {
    title: 'Arc',
    subtitle: 'Stablecoin-focused blockchain.',
    body: 'The network where Arklake settles and verifies USDC payments on-chain.',
    tone: 'aqua',
    icon: '/brand/arc-network-icon.svg',
  },
  {
    title: 'Circle',
    subtitle: 'Wallet and USDC infrastructure.',
    body: 'Circle provides infrastructure that helps power Arklake accounts and payments behind the scenes.',
    tone: 'gold',
    icon: '/brand/circle-icon.svg',
  },
  {
    title: 'USDC',
    subtitle: 'The currency used for payment.',
    body: 'Send, receive and get paid in USDC through Arklake.',
    tone: 'ink',
    icon: '/brand/usdc-token.svg',
  },
]

function InfrastructureSection() {
  return (
    <section id="infrastructure" className={`${shellWidth} pb-24 pt-2 lg:pb-32 lg:pt-0`}>
      <div className="mx-auto max-w-3xl min-w-0 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-arklake-aqua">Built for stablecoin payments</p>
        <h2 className="mx-auto mt-4 max-w-[20rem] text-[2rem] font-semibold leading-[1.04] tracking-[-0.055em] text-arklake-ink sm:max-w-[44rem] sm:text-5xl">
          Simple on the surface.<br className="hidden sm:block" /> Powerful underneath.
        </h2>
        <p className="mx-auto mt-4 max-w-[20rem] text-base leading-7 text-slate sm:max-w-[43rem] sm:text-lg sm:leading-8">
          Arklake brings together infrastructure from Arc and Circle to make USDC payments feel simple — without exposing the complexity behind every transaction.
        </p>
      </div>

      <div className="mt-12 grid w-full min-w-0 grid-cols-1 gap-5 md:grid-cols-3 lg:mt-14 lg:gap-6">
        {infrastructureCards.map((card) => {
          const isGold = card.tone === 'gold'
          const isAqua = card.tone === 'aqua'

          return (
            <article key={card.title} className="flex min-w-0 flex-col rounded-[2rem] border border-lake-border bg-surface p-6 shadow-[0_18px_54px_rgba(20,33,39,0.07)] sm:p-7">
              <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${isGold ? 'border border-arklake-gold/35 bg-arklake-gold/10 text-arklake-ink' : isAqua ? 'border border-arklake-aqua/30 bg-aqua-mist text-arklake-aqua' : 'border border-lake-border bg-lake-canvas text-arklake-ink'}`}>
                <img className="h-6 w-6 object-contain" src={card.icon} alt="" aria-hidden="true" />
              </div>
              <h3 className="mt-6 text-2xl font-semibold tracking-[-0.04em] text-arklake-ink">{card.title}</h3>
              <p className="mt-2 text-sm font-semibold leading-6 text-deep-text">{card.subtitle}</p>
              <p className="mt-4 text-sm leading-6 text-slate md:min-h-[4.5rem]">{card.body}</p>
            </article>
          )
        })}
      </div>
    </section>
  )
}

function FinalCtaVisual() {
  return (
    <div className="relative mx-auto w-full min-w-0 max-w-[520px] lg:ml-auto lg:mr-0" aria-label="Arklake payment confirmation visual">
      <div className="relative rounded-[2rem] border border-lake-border bg-surface p-4 shadow-[0_30px_86px_rgba(20,33,39,0.12)] sm:rounded-[2.4rem] sm:p-5">
        <div className="rounded-[1.7rem] border border-lake-border bg-lake-canvas p-4 sm:p-6">
          <div className="rounded-[1.5rem] border border-lake-border bg-surface p-5 shadow-[0_16px_42px_rgba(20,33,39,0.07)] sm:p-6">
            <div className="flex min-w-0 items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-arklake-ink">Invoice sent</p>
                <p className="mt-2 text-2xl font-semibold tracking-[-0.05em] text-arklake-ink sm:text-3xl">250.00 USDC</p>
              </div>
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-arklake-gold/35 bg-arklake-gold/10 text-arklake-ink">
                <svg className="h-5 w-5" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <path d="M6 3.75h8A1.25 1.25 0 0 1 15.25 5v10.75L13 14.5l-2.25 1.25L8.5 14.5l-2.25 1.25V5A1.25 1.25 0 0 1 7.5 3.75Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                  <path d="M8.25 7.5h3.5M8.25 10.25h2.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 px-3 py-4" aria-hidden="true">
            <span className="h-px flex-1 bg-arklake-aqua/25" />
            <span className="flex h-10 w-10 items-center justify-center rounded-full border border-arklake-aqua/45 bg-aqua-mist text-arklake-aqua shadow-[0_0_0_7px_rgba(50,199,193,0.10)]">
              <svg className="h-4.5 w-4.5" viewBox="0 0 16 16" fill="none">
                <path d="M4 8.2 6.7 10.8 12 5.25" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <span className="h-px flex-1 bg-arklake-aqua/25" />
          </div>

          <div className="rounded-[1.5rem] border border-arklake-aqua/25 bg-surface p-5 shadow-[0_16px_42px_rgba(20,33,39,0.07)] sm:p-6">
            <div className="flex min-w-0 items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-arklake-ink">Payment received</p>
                <p className="mt-2 text-2xl font-semibold tracking-[-0.05em] text-arklake-ink sm:text-3xl">250.00 USDC</p>
              </div>
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-arklake-aqua/30 bg-aqua-mist text-arklake-aqua">
                <svg className="h-5 w-5" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <path d="M4 10.5V13a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-2.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  <path d="M10 4.5v7M7.25 8.75 10 11.5l2.75-2.75" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function FinalCtaSection() {
  return (
    <section id="final-cta" className={`${shellWidth} pb-24 pt-2 lg:pb-32 lg:pt-0`}>
      <div className="grid min-w-0 grid-cols-1 items-center gap-10 rounded-[2.1rem] border border-lake-border bg-surface p-6 shadow-[0_28px_88px_rgba(20,33,39,0.10)] sm:rounded-[2.6rem] sm:p-8 lg:grid-cols-[0.95fr_1.05fr] lg:gap-12 lg:p-10">
        <div className="min-w-0 max-w-[560px]">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-arklake-aqua">Ready to get started?</p>
          <h2 className="mt-4 max-w-[20rem] text-[2rem] font-semibold leading-[1.04] tracking-[-0.055em] text-arklake-ink sm:max-w-[36rem] sm:text-5xl">
            Start accepting and paying with USDC.
          </h2>
          <p className="mt-4 max-w-[20rem] text-base leading-7 text-slate sm:max-w-[34rem] sm:text-lg sm:leading-8">
            Create your Arklake account to send invoices, receive payments and pay with USDC.
          </p>

          <div className="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <a className="inline-flex w-full items-center justify-center rounded-full bg-arklake-ink px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-deep-text hover:ring-4 hover:ring-arklake-aqua/15 sm:w-auto" href="#">
              Get started
            </a>
            <a className="inline-flex w-full items-center justify-center rounded-full border border-lake-border bg-surface px-6 py-3 text-sm font-semibold text-arklake-ink transition hover:border-arklake-aqua sm:w-auto" href="#">
              Sign in
            </a>
          </div>
        </div>

        <FinalCtaVisual />
      </div>
    </section>
  )
}

const footerColumns = [
  {
    title: 'Product',
    links: [
      { label: 'Invoicing', href: '/docs/invoicing' },
      { label: 'Wallet', href: '/docs/wallet' },
      { label: 'Swap', href: '/docs/swap' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { label: 'Docs', href: '/docs' },
      { label: 'How it works', href: '#how-it-works' },
    ],
  },
  {
    title: 'Company',
    links: [{ label: 'About', href: '/about' }],
  },
]

function FooterLink({ label, href }: { label: string; href?: string }) {
  if (href) {
    return (
      <a
        className="text-sm leading-6 text-slate transition hover:text-arklake-ink"
        href={href}
        onClick={
          href === '#how-it-works'
            ? (event) => {
                event.preventDefault()

                if (window.location.pathname === '/') {
                  scrollToLandingSection('how-it-works')
                  return
                }

                window.sessionStorage.setItem(pendingLandingScrollKey, 'how-it-works')
                window.location.assign('/')
              }
            : undefined
        }
      >
        {label}
      </a>
    )
  }

  return <span className="text-sm leading-6 text-slate">{label}</span>
}

const pendingLandingScrollKey = 'arklake-pending-landing-scroll'

function scrollToLandingSection(targetId: string) {
  document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth' })
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`)
}

function Footer() {
  return (
    <footer className="mt-2 w-full min-w-0 border-t border-lake-border bg-aqua-mist/45">
      <div className={`${shellWidth} pt-12 sm:pt-14 lg:pt-16`}>
        <div className="grid min-w-0 grid-cols-1 gap-10 pb-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-16 lg:pb-14">
          <div className="min-w-0">
            <a href="#" className="inline-flex max-w-full items-center text-arklake-ink">
              <ProductMark />
            </a>
            <p className="mt-6 max-w-[16rem] text-2xl font-semibold leading-[1.08] tracking-[-0.045em] text-arklake-ink sm:text-3xl">
              Stablecoin payments,<br /> made simple.
            </p>
          </div>

          <div className="grid min-w-0 grid-cols-1 gap-8 sm:grid-cols-3 sm:gap-6">
            {footerColumns.map((column) => (
              <div key={column.title} className="min-w-0">
                <h2 className="text-sm font-semibold tracking-[-0.01em] text-arklake-ink">{column.title}</h2>
                <div className="mt-4 flex min-w-0 flex-col gap-3">
                  {column.links.map((link) => (
                    <FooterLink key={link.label} {...link} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-lake-border py-7 sm:py-8">
          <p className="text-sm leading-6 text-slate">© 2026 Arklake. All rights reserved.</p>
        </div>
      </div>
    </footer>
  )
}

function AboutPage() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isMobileProductOpen, setIsMobileProductOpen] = useState(false)

  return (
    <main className="min-h-screen bg-lake-canvas text-deep-text">
      <header className={`${shellWidth} sticky top-0 z-30 bg-lake-canvas/90 py-6 shadow-[0_1px_0_rgba(20,33,39,0.08)] backdrop-blur-md`}>
        <div className="flex min-w-0 items-center justify-between">
          <a href="/" className="flex items-center text-arklake-ink">
            <ProductMark />
          </a>

          <nav className="hidden items-center gap-8 text-sm font-medium text-slate md:flex" aria-label="Main navigation">
            <div className="group relative">
              <button className="inline-flex items-center gap-1.5 transition hover:text-arklake-ink group-focus-within:text-arklake-ink" type="button">
                <span>Product</span>
                <svg className="h-3 w-3 transition group-hover:rotate-180 group-focus-within:rotate-180" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                  <path d="M3 4.5 6 7.5l3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>

              <div className="invisible absolute left-1/2 top-full z-20 w-[21rem] -translate-x-1/2 pt-4 opacity-0 transition duration-150 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
                <div className="rounded-[1.5rem] border border-lake-border bg-surface p-3 shadow-[0_24px_70px_rgba(20,33,39,0.12)]">
                  {productNavItems.map(([label, description]) => (
                    <a key={label} className="block rounded-[1.1rem] px-4 py-3 transition hover:bg-aqua-mist/70" href="/#product">
                      <p className="text-sm font-semibold text-arklake-ink">{label}</p>
                      <p className="mt-1 text-xs leading-5 text-slate">{description}</p>
                    </a>
                  ))}
                </div>
              </div>
            </div>
            <a className="transition hover:text-arklake-ink" href="/#how-it-works">How it works</a>
            <a className="transition hover:text-arklake-ink" href="/docs">Docs</a>
            <a className="font-semibold text-arklake-ink" href="/about">About</a>
          </nav>

          <div className="hidden items-center gap-3 sm:flex">
            <a className="hidden text-sm font-semibold text-arklake-ink sm:inline-flex" href="#">Sign in</a>
            <a className="rounded-full bg-arklake-ink px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-deep-text" href="#">
              Get started
            </a>
          </div>

          <button
            className="flex h-11 w-11 items-center justify-center rounded-full border border-lake-border bg-surface text-arklake-ink shadow-sm md:hidden"
            type="button"
            aria-label="Toggle navigation menu"
            aria-expanded={isMobileMenuOpen}
            onClick={() => setIsMobileMenuOpen((isOpen) => !isOpen)}
          >
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              {isMobileMenuOpen ? (
                <path d="M5.5 5.5 14.5 14.5M14.5 5.5 5.5 14.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
              ) : (
                <path d="M4.5 6.5h11M4.5 10h11M4.5 13.5h11" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
              )}
            </svg>
          </button>
        </div>

        {isMobileMenuOpen ? (
          <nav className="mt-5 rounded-[1.65rem] border border-lake-border bg-surface p-3 shadow-[0_22px_64px_rgba(20,33,39,0.10)] md:hidden" aria-label="Mobile navigation">
            <button
              className="flex w-full items-center justify-between rounded-[1.15rem] px-4 py-3 text-left text-sm font-semibold text-arklake-ink transition hover:bg-aqua-mist/70"
              type="button"
              aria-expanded={isMobileProductOpen}
              onClick={() => setIsMobileProductOpen((isOpen) => !isOpen)}
            >
              <span>Product</span>
              <svg className={`h-3.5 w-3.5 text-arklake-aqua transition ${isMobileProductOpen ? 'rotate-180' : ''}`} viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <path d="M3 4.5 6 7.5l3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            {isMobileProductOpen ? (
              <div className="space-y-1 px-2 pb-2">
                {productNavItems.map(([label, description]) => (
                  <a key={label} className="block rounded-[1.1rem] px-4 py-3" href="/#product">
                    <p className="text-sm font-semibold text-arklake-ink">{label}</p>
                    <p className="mt-1 text-xs leading-5 text-slate">{description}</p>
                  </a>
                ))}
              </div>
            ) : null}

            <div className="mt-1 flex flex-col gap-1 px-1">
              <a className="rounded-[1.15rem] px-4 py-3 text-sm font-semibold text-slate" href="/#how-it-works">How it works</a>
              <a className="rounded-[1.15rem] px-4 py-3 text-sm font-semibold text-slate" href="/docs">Docs</a>
              <a className="rounded-[1.15rem] px-4 py-3 text-sm font-semibold text-arklake-ink" href="/about">About</a>
              <span className="rounded-[1.15rem] px-4 py-3 text-sm font-semibold text-arklake-ink">Sign in</span>
              <span className="mt-2 inline-flex w-full items-center justify-center rounded-full bg-arklake-ink px-6 py-3 text-sm font-semibold text-white shadow-sm">
                Get started
              </span>
            </div>
          </nav>
        ) : null}
      </header>

      <section className={`${shellWidth} grid min-w-0 grid-cols-1 gap-10 pb-18 pt-16 md:grid-cols-[0.78fr_1.22fr] md:gap-16 lg:pb-24 lg:pt-24`}>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-arklake-aqua">About</p>
          <h1 className="mt-4 text-[3.4rem] font-semibold leading-[0.92] tracking-[-0.075em] text-arklake-ink sm:text-7xl lg:text-[6.5rem]">
            About<br />Arklake
          </h1>
        </div>
        <div className="min-w-0 max-w-3xl space-y-6 text-xl leading-9 tracking-[-0.025em] text-arklake-ink sm:text-2xl sm:leading-10">
          <p>Arklake is a stablecoin payment platform designed to make digital payments feel as simple as the online payments people already use.</p>
          <p>Instead of requiring users to understand wallets, networks or payment infrastructure before they can get started, Arklake brings invoicing, payments and stablecoin tools into one simple account. Create an invoice, send it by email, choose how to pay and track the payment from one place.</p>
        </div>
      </section>

      <section className={`${shellWidth} pb-22 lg:pb-28`}>
        <div className="grid min-w-0 grid-cols-1 gap-5 md:grid-cols-2 lg:gap-6">
          <article className="rounded-[2rem] border border-arklake-aqua/25 bg-aqua-mist p-7 shadow-[0_18px_54px_rgba(20,33,39,0.06)] sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-arklake-aqua">Mission</p>
            <p className="mt-5 text-2xl font-semibold leading-[1.12] tracking-[-0.045em] text-arklake-ink sm:text-3xl">Make stablecoin payments simple enough for everyday businesses and people to use without needing to understand the infrastructure underneath.</p>
          </article>
          <article className="rounded-[2rem] border border-arklake-gold/30 bg-arklake-gold/10 p-7 shadow-[0_18px_54px_rgba(20,33,39,0.06)] sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-arklake-aqua">Vision</p>
            <p className="mt-5 text-2xl font-semibold leading-[1.12] tracking-[-0.045em] text-arklake-ink sm:text-3xl">A world where sending an invoice, receiving money and paying with stablecoins feels as familiar as using any modern payment product.</p>
          </article>
        </div>
      </section>

      <section className={`${shellWidth} grid min-w-0 grid-cols-1 gap-10 border-y border-lake-border py-18 md:grid-cols-[0.78fr_1.22fr] md:gap-16 lg:py-24`}>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-arklake-aqua">Founder</p>
          <h2 className="mt-4 text-4xl font-semibold tracking-[-0.055em] text-arklake-ink sm:text-5xl">Founder</h2>
        </div>
        <article className="max-w-2xl rounded-[2.25rem] border border-lake-border bg-surface p-6 shadow-[0_24px_70px_rgba(20,33,39,0.08)] sm:p-8">
          <img className="aspect-[4/5] w-full rounded-[1.65rem] border border-lake-border object-cover object-top" src="/brand/founder-ark.jpg" alt="Thu Phuong Ngo" />
          <div className="mt-7">
            <p className="text-3xl font-semibold tracking-[-0.045em] text-arklake-ink sm:text-4xl">Thu Phuong Ngo</p>
            <p className="mt-2 text-sm font-semibold text-slate">Founder, Arklake</p>
            <div className="mt-5 flex gap-3 text-sm font-semibold text-arklake-ink">
              <a className="rounded-full border border-lake-border px-4 py-2 text-slate transition hover:border-arklake-aqua hover:text-arklake-ink" href="https://x.com/DuckSentient" target="_blank" rel="noreferrer">X</a>
              <a className="rounded-full border border-lake-border px-4 py-2 text-slate transition hover:border-arklake-aqua hover:text-arklake-ink" href="https://www.linkedin.com/in/thu-ph%C6%B0%C6%A1ng-ng%C3%B4-875470412/" target="_blank" rel="noreferrer">LinkedIn</a>
            </div>
          </div>
        </article>
      </section>

      <section className={`${shellWidth} py-18 lg:py-24`}>
        <div className="max-w-3xl rounded-[2.25rem] border border-lake-border bg-surface p-8 shadow-[0_24px_70px_rgba(20,33,39,0.08)] sm:p-10">
          <h2 className="text-[2.4rem] font-semibold leading-[1.02] tracking-[-0.06em] text-arklake-ink sm:text-5xl">
            Stablecoin payments,<br />made simple.
          </h2>
          <p className="mt-5 max-w-xl text-base leading-7 text-slate sm:text-lg sm:leading-8">Built for a simpler way to invoice, pay and manage stablecoins.</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <a className="inline-flex items-center justify-center rounded-full bg-arklake-ink px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-deep-text" href="/docs">
              Read the docs
            </a>
            <a className="inline-flex items-center justify-center rounded-full border border-lake-border bg-surface px-6 py-3 text-sm font-semibold text-arklake-ink transition hover:border-arklake-aqua" href="/">
              Explore Arklake
            </a>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  )
}

const appNavItems = [
  ['Home', '/app/icons/nav-home.svg'],
  ['Invoices', '/app/icons/nav-invoices.svg'],
  ['Wallet', '/app/icons/nav-wallet.svg'],
  ['Swap', '/app/icons/nav-swap.svg'],
  ['Account', '/app/icons/nav-account.svg'],
]

function AppIcon({ src }: { src: string }) {
  return (
    <span
      className="h-5 w-5 shrink-0 bg-current"
      style={{
        mask: `url(${src}) center / contain no-repeat`,
        WebkitMask: `url(${src}) center / contain no-repeat`,
      }}
      aria-hidden="true"
    />
  )
}

type AppNavigateHandler = (path: string) => void

function AppSidebar({ activeItem = 'Home', onNavigate }: { activeItem?: string; onNavigate: AppNavigateHandler }) {
  const handleNavClick = (event: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    event.preventDefault()
    onNavigate(href)
  }

  return (
    <aside className="hidden min-h-screen w-[272px] shrink-0 flex-col border-r border-lake-border bg-surface px-6 py-7 lg:flex">
      <a href="/app" className="flex h-10 items-center text-arklake-ink" aria-label="Arklake app home" onClick={(event) => handleNavClick(event, '/app')}>
        <ProductMark />
      </a>

      <nav className="mt-9 flex flex-1 flex-col gap-1.5 text-sm font-semibold text-slate" aria-label="App navigation">
        {appNavItems.map(([item, icon]) => {
          const isActive = item === activeItem
          const href = item === 'Home' ? '/app' : `/app/${item.toLowerCase()}`

          return (
            <a
              key={item}
              className={`flex items-center gap-3 rounded-2xl px-4 py-3.5 transition ${
                isActive ? 'bg-aqua-mist text-arklake-ink shadow-sm' : 'text-slate'
              }`}
              href={href}
              onClick={(event) => handleNavClick(event, href)}
            >
              <AppIcon src={icon} />
              {item}
            </a>
          )
        })}
      </nav>
    </aside>
  )
}

function AppHeader({ title = 'Home', subtitle = 'Your account overview.', onNavigate }: { title?: string; subtitle?: string; onNavigate: AppNavigateHandler }) {
  return (
    <header className="flex min-w-0 flex-col gap-4 border-b border-lake-border bg-lake-canvas px-4 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-10 lg:py-7">
      <div className="min-w-0">
        <h1 className="text-3xl font-semibold tracking-[-0.055em] text-arklake-ink">{title}</h1>
        <p className="mt-1 text-sm leading-6 text-slate">{subtitle}</p>
      </div>

      <div className="flex w-full flex-wrap items-center gap-3 lg:w-auto lg:shrink-0">
        <a href="/app/invoices/create" className="flex flex-1 items-center justify-center rounded-full bg-arklake-ink px-5 py-2.5 text-sm font-semibold text-white shadow-sm sm:flex-none" onClick={(event) => {
          event.preventDefault()
          onNavigate('/app/invoices/create')
        }}>
          + Create invoice
        </a>
        <button type="button" className="flex h-10 w-10 items-center justify-center rounded-full border border-lake-border bg-surface text-arklake-ink shadow-sm" aria-label="Notifications">
          <svg className="h-4.5 w-4.5" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M15 8.5a5 5 0 0 0-10 0c0 4-1.5 5-1.5 5h13S15 12.5 15 8.5Z" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M8.4 16a1.8 1.8 0 0 0 3.2 0" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" />
          </svg>
        </button>
        <button type="button" className="flex items-center gap-2 rounded-full border border-lake-border bg-surface py-1.5 pl-1.5 pr-3 text-sm font-semibold text-arklake-ink shadow-sm" aria-label="Account menu">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-aqua-mist text-sm font-semibold text-arklake-aqua">D</span>
          <svg className="h-3.5 w-3.5 text-slate" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M3 4.5 6 7.5l3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </header>
  )
}

function AppMobileNav({ activeItem, onNavigate }: { activeItem: string; onNavigate: AppNavigateHandler }) {
  const handleNavClick = (event: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    event.preventDefault()
    onNavigate(href)
  }

  return (
    <div className="border-b border-lake-border bg-surface px-4 py-4 sm:px-6 lg:hidden">
      <a href="/app" className="flex h-9 items-center text-arklake-ink" aria-label="Arklake app home" onClick={(event) => handleNavClick(event, '/app')}>
        <ProductMark />
      </a>

      <nav className="mt-4 flex flex-wrap gap-2 text-sm font-semibold text-slate" aria-label="Mobile app navigation">
        {appNavItems.map(([item, icon]) => {
          const isActive = item === activeItem
          const href = item === 'Home' ? '/app' : `/app/${item.toLowerCase()}`

          return (
            <a
              key={item}
              className={`flex shrink-0 items-center gap-2 rounded-full px-3 py-2.5 transition sm:px-3.5 ${
                isActive ? 'bg-aqua-mist text-arklake-ink shadow-sm' : 'border border-lake-border bg-lake-canvas text-slate'
              }`}
              href={href}
              onClick={(event) => handleNavClick(event, href)}
            >
              <AppIcon src={icon} />
              {item}
            </a>
          )
        })}
      </nav>
    </div>
  )
}

function AppShell({ activeItem, title, subtitle, children, onNavigate }: { activeItem: string; title: string; subtitle: string; children: React.ReactNode; onNavigate: AppNavigateHandler }) {
  return (
    <main className="min-h-screen bg-lake-canvas text-deep-text">
      <div className="flex min-h-screen min-w-0 flex-col lg:flex-row">
        <AppSidebar activeItem={activeItem} onNavigate={onNavigate} />
        <section className="flex min-w-0 flex-1 flex-col">
          <AppMobileNav activeItem={activeItem} onNavigate={onNavigate} />
          <AppHeader title={title} subtitle={subtitle} onNavigate={onNavigate} />
          <div className="min-w-0 flex-1 px-4 py-5 sm:px-6 lg:px-10 lg:py-8">
            {children}
          </div>
        </section>
      </div>
    </main>
  )
}

function AppHomePage({ onNavigate }: { onNavigate: AppNavigateHandler }) {
  return (
    <AppShell activeItem="Home" title="Home" subtitle="Your account overview." onNavigate={onNavigate}>
      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(340px,0.62fr)]">
              <div className="rounded-[2rem] border border-lake-border bg-surface p-6 shadow-sm">
                <div className="flex min-h-[224px] flex-col items-start justify-between gap-6 overflow-hidden rounded-[1.5rem] bg-gradient-to-br from-white to-aqua-mist/60 px-6 py-6 sm:px-8 lg:flex-row lg:items-center lg:gap-7">
                  <div className="relative z-10 min-w-0">
                    <p className="text-sm font-semibold text-slate">Available to pay</p>
                    <p className="mt-5 whitespace-nowrap text-[2.65rem] font-semibold leading-none tracking-[-0.065em] text-arklake-ink sm:text-5xl">0.00 USDC</p>
                    <p className="mt-3 text-sm font-medium text-slate">≈ $0.00 USD</p>
                  </div>
                  <img
                    className="mx-auto h-auto w-full max-w-[260px] shrink-0 object-contain sm:max-w-[310px] lg:h-[190px] lg:w-[310px]"
                    src="/app/illustrations/wallet-hero.svg"
                    alt=""
                    aria-hidden="true"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
                <div className="min-h-[148px] rounded-[1.75rem] border border-lake-border bg-surface p-5 shadow-sm">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-aqua-mist text-arklake-aqua">
                    <svg className="h-5 w-5" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                      <path d="M10 4.5v10M6.25 10.75 10 14.5l3.75-3.75" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <h2 className="mt-4 text-xl font-semibold tracking-[-0.04em] text-arklake-ink">Receive</h2>
                  <p className="mt-1 text-sm leading-6 text-slate">Get paid by anyone</p>
                </div>

                <div className="min-h-[148px] rounded-[1.75rem] border border-aqua-mist bg-aqua-mist p-5 shadow-sm">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-arklake-aqua">
                    <svg className="h-5 w-5" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                      <path d="M10 15.5v-10M6.25 9.25 10 5.5l3.75 3.75" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <h2 className="mt-4 text-xl font-semibold tracking-[-0.04em] text-arklake-ink">Send</h2>
                  <p className="mt-1 text-sm leading-6 text-slate">Pay anyone</p>
                </div>
              </div>
            </section>

            <section className="mt-6 rounded-[2rem] border border-lake-border bg-surface p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold tracking-[-0.04em] text-arklake-ink">Invoices</h2>
                <button type="button" className="text-sm font-semibold text-arklake-aqua">View all</button>
              </div>

              <div className="flex min-h-[276px] flex-col items-center justify-center px-6 py-8 text-center">
                <img
                  className="h-[154px] w-[206px] object-contain"
                  src="/app/illustrations/invoice-empty.svg"
                  alt=""
                  aria-hidden="true"
                />
                <h3 className="mt-3 text-2xl font-semibold tracking-[-0.05em] text-arklake-ink">No invoices yet</h3>
                <p className="mt-2 max-w-sm text-sm leading-6 text-slate">
                  Create an invoice and request payment from anyone by email.
                </p>
                <a href="/app/invoices/create" className="mt-5 rounded-full bg-arklake-ink px-5 py-2.5 text-sm font-semibold text-white shadow-sm" onClick={(event) => {
                  event.preventDefault()
                  onNavigate('/app/invoices/create')
                }}>
                  + Create invoice
                </a>
              </div>
            </section>
    </AppShell>
  )
}

type InvoiceStatus = 'Draft' | 'Unpaid' | 'Verifying' | 'Paid' | 'Expired'

type RuntimeInvoice = {
  id: string
  billTo: string
  amount: string
  asset: 'USDC'
  memo: string
  createdAt: Date
  expiresAt: Date
  status: 'Unpaid'
}

const runtimeInvoicesStorageKey = 'arklake_runtime_invoices_v1'

type StoredRuntimeInvoice = Omit<RuntimeInvoice, 'createdAt' | 'expiresAt'> & {
  createdAt: string
  expiresAt: string
}

const parseStoredRuntimeInvoiceDate = (value: unknown) => {
  if (typeof value !== 'string') return null

  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

const parseStoredRuntimeInvoice = (value: unknown): RuntimeInvoice | null => {
  if (!value || typeof value !== 'object') return null

  const invoice = value as Partial<StoredRuntimeInvoice>
  const createdAt = parseStoredRuntimeInvoiceDate(invoice.createdAt)
  const expiresAt = parseStoredRuntimeInvoiceDate(invoice.expiresAt)

  if (
    typeof invoice.id !== 'string' ||
    typeof invoice.billTo !== 'string' ||
    typeof invoice.amount !== 'string' ||
    invoice.asset !== 'USDC' ||
    typeof invoice.memo !== 'string' ||
    invoice.status !== 'Unpaid' ||
    !createdAt ||
    !expiresAt
  ) {
    return null
  }

  return {
    id: invoice.id,
    billTo: invoice.billTo,
    amount: invoice.amount,
    asset: invoice.asset,
    memo: invoice.memo,
    createdAt,
    expiresAt,
    status: invoice.status,
  }
}

const loadRuntimeInvoices = () => {
  try {
    const storedInvoices = window.localStorage.getItem(runtimeInvoicesStorageKey)
    if (!storedInvoices) return []

    const parsedInvoices = JSON.parse(storedInvoices)
    if (!Array.isArray(parsedInvoices)) return []

    const runtimeInvoices = parsedInvoices.map(parseStoredRuntimeInvoice)
    if (runtimeInvoices.some((invoice) => invoice === null)) return []

    return runtimeInvoices as RuntimeInvoice[]
  } catch {
    return []
  }
}

const serializeRuntimeInvoices = (invoices: RuntimeInvoice[]): StoredRuntimeInvoice[] =>
  invoices.map((invoice) => ({
    ...invoice,
    createdAt: invoice.createdAt.toISOString(),
    expiresAt: invoice.expiresAt.toISOString(),
  }))

const formatInvoiceDate = (date: Date) =>
  date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

const formatInvoiceDateTime = (date: Date) =>
  date.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })

const getExpiryDate = (expiry: string, createdAt: Date) => {
  const expiresAt = new Date(createdAt)

  if (expiry === '24 hours') {
    expiresAt.setHours(expiresAt.getHours() + 24)
  } else if (expiry === '3 days') {
    expiresAt.setDate(expiresAt.getDate() + 3)
  } else if (expiry === '30 days') {
    expiresAt.setDate(expiresAt.getDate() + 30)
  } else {
    expiresAt.setDate(expiresAt.getDate() + 7)
  }

  return expiresAt
}

function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  const statusClassNames: Record<InvoiceStatus, string> = {
    Draft: 'border-slate/15 bg-slate/5 text-slate',
    Unpaid: 'border-amber-200 bg-amber-50 text-amber-700',
    Verifying: 'border-sky-200 bg-sky-50 text-sky-700',
    Paid: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    Expired: 'border-red-200 bg-red-50 text-red-700',
  }

  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${statusClassNames[status]}`}>
      {status}
    </span>
  )
}

const isRuntimeInvoiceExpired = (invoice: RuntimeInvoice) =>
  invoice.status === 'Unpaid' && invoice.expiresAt.getTime() <= Date.now()

const getRuntimeInvoiceStatus = (invoice: RuntimeInvoice): InvoiceStatus =>
  isRuntimeInvoiceExpired(invoice) ? 'Expired' : invoice.status

function AppInvoicesPage({ runtimeInvoices = [], onNavigate }: { runtimeInvoices?: RuntimeInvoice[]; onNavigate: (path: string) => void }) {
  const [statusFilter, setStatusFilter] = useState<'All' | 'Unpaid' | 'Expired'>('All')
  const [searchQuery, setSearchQuery] = useState('')
  const [dateSort, setDateSort] = useState<'Newest first' | 'Oldest first'>('Newest first')
  const [isDateSortOpen, setIsDateSortOpen] = useState(false)
  const dateSortRef = useRef<HTMLDivElement>(null)
  const normalizedSearchQuery = searchQuery.trim().toLowerCase()
  const invoices = runtimeInvoices.map((invoice) => ({
    invoice: invoice.id,
    recipient: invoice.billTo,
    memo: invoice.memo,
    amount: `${invoice.amount} ${invoice.asset}`,
    createdAt: invoice.createdAt,
    date: formatInvoiceDate(invoice.createdAt),
    status: getRuntimeInvoiceStatus(invoice),
    href: `/app/invoices/${invoice.id}`,
  }))
  const filteredInvoices = invoices.filter((invoice) => {
    const matchesStatus = statusFilter === 'All' || invoice.status === statusFilter
    const matchesSearch = !normalizedSearchQuery || [invoice.invoice, invoice.recipient, invoice.memo].some((value) => value.toLowerCase().includes(normalizedSearchQuery))

    return matchesStatus && matchesSearch
  })
  const sortedInvoices = [...filteredInvoices].sort((a, b) => {
    const diff = b.createdAt.getTime() - a.createdAt.getTime()
    return dateSort === 'Newest first' ? diff : -diff
  })
  const emptyTitle = normalizedSearchQuery ? 'No matching invoices' : statusFilter === 'Expired' ? 'No expired invoices' : statusFilter === 'Unpaid' ? 'No unpaid invoices' : 'No invoices yet'
  const emptyDescription = normalizedSearchQuery
    ? 'Try a different search or clear the search field.'
    : statusFilter === 'All'
    ? 'Create an invoice and request payment from anyone by email.'
    : 'Try another status filter or create a new invoice.'

  const handleInvoiceClick = (href: string) => {
    onNavigate(href)
  }

  const handleInvoiceKeyDown = (event: React.KeyboardEvent<HTMLElement>, href: string) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      handleInvoiceClick(href)
    }
  }

  const handleInvoiceLinkClick = (event: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    event.preventDefault()
    event.stopPropagation()
    handleInvoiceClick(href)
  }

  useEffect(() => {
    if (!isDateSortOpen) return

    const handlePointerDown = (event: PointerEvent) => {
      if (!dateSortRef.current?.contains(event.target as Node)) {
        setIsDateSortOpen(false)
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsDateSortOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isDateSortOpen])

  return (
    <AppShell activeItem="Invoices" title="Invoices" subtitle="Create, receive and track payments." onNavigate={onNavigate}>
      <section className="rounded-[2rem] border border-lake-border bg-surface p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-end gap-4 border-b border-lake-border pb-5">
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex rounded-full border border-lake-border bg-lake-canvas p-1 text-sm font-semibold text-slate" aria-label="Filter invoices by status">
              {(['All', 'Unpaid', 'Expired'] as const).map((filter) => (
                <button
                  key={filter}
                  type="button"
                  className={`rounded-full px-4 py-1.5 ${statusFilter === filter ? 'bg-surface text-arklake-ink shadow-sm' : ''}`}
                  onClick={() => setStatusFilter(filter)}
                >
                  {filter}
                </button>
              ))}
            </div>
            <div className="relative" ref={dateSortRef}>
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-full border border-lake-border bg-surface px-4 py-2.5 text-sm font-semibold text-slate shadow-sm"
                aria-haspopup="menu"
                aria-expanded={isDateSortOpen}
                onClick={() => setIsDateSortOpen((isOpen) => !isOpen)}
              >
                {dateSort}
                <svg className="h-3.5 w-3.5" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                  <path d="M3 4.5 6 7.5l3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              {isDateSortOpen ? (
                <div className="absolute right-0 z-20 mt-2 w-40 rounded-2xl border border-lake-border bg-surface p-1.5 shadow-[0_18px_54px_rgba(20,33,39,0.12)]" role="menu">
                  {(['Newest first', 'Oldest first'] as const).map((option) => (
                    <button
                      key={option}
                      type="button"
                      className={`w-full rounded-xl px-3 py-2 text-left text-sm font-semibold ${dateSort === option ? 'bg-aqua-mist text-arklake-ink' : 'text-slate hover:bg-lake-canvas hover:text-arklake-ink'}`}
                      role="menuitemradio"
                      aria-checked={dateSort === option}
                      onClick={() => {
                        setDateSort(option)
                        setIsDateSortOpen(false)
                      }}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <label className="flex min-w-[260px] items-center gap-2 rounded-full border border-lake-border bg-surface px-4 py-2.5 text-sm text-slate shadow-sm">
              <svg className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="m14.5 14.5 2.5 2.5M8.75 15a6.25 6.25 0 1 0 0-12.5 6.25 6.25 0 0 0 0 12.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
              <input
                className="min-w-0 flex-1 bg-transparent text-sm font-medium outline-none placeholder:text-slate"
                placeholder="Search invoices"
                aria-label="Search invoices"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
            </label>
          </div>
        </div>

        {sortedInvoices.length === 0 ? (
          <div className="flex min-h-[360px] flex-col items-center justify-center px-6 py-8 text-center">
            <img
              className="h-[154px] w-[206px] object-contain"
              src="/app/illustrations/invoice-empty.svg"
              alt=""
              aria-hidden="true"
            />
            <h3 className="mt-3 text-2xl font-semibold tracking-[-0.05em] text-arklake-ink">{emptyTitle}</h3>
            <p className="mt-2 max-w-sm text-sm leading-6 text-slate">
              {emptyDescription}
            </p>
            <a href="/app/invoices/create" className="mt-5 rounded-full bg-arklake-ink px-5 py-2.5 text-sm font-semibold text-white shadow-sm" onClick={(event) => {
              event.preventDefault()
              onNavigate('/app/invoices/create')
            }}>
              + Create invoice
            </a>
          </div>
        ) : (
          <>
            <div className="mt-4 grid gap-3 lg:hidden">
              {sortedInvoices.map((invoice) => (
            <article
              key={invoice.invoice}
              className={`rounded-[1.5rem] border border-lake-border bg-surface px-4 py-4 shadow-sm ${invoice.href ? 'cursor-pointer transition hover:bg-aqua-mist/30' : ''}`}
              onClick={invoice.href ? () => handleInvoiceClick(invoice.href!) : undefined}
              onKeyDown={invoice.href ? (event) => handleInvoiceKeyDown(event, invoice.href!) : undefined}
              role={invoice.href ? 'link' : undefined}
              tabIndex={invoice.href ? 0 : undefined}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {invoice.href ? (
                      <a href={invoice.href} className="break-all font-semibold text-arklake-ink" onClick={(event) => handleInvoiceLinkClick(event, invoice.href!)}>{invoice.invoice}</a>
                    ) : (
                      <h3 className="font-semibold text-arklake-ink">{invoice.invoice}</h3>
                    )}
                    <svg className="h-4 w-4 shrink-0 text-slate" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <path d="m6 4 4 4-4 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <p className="mt-1 break-words text-sm font-medium text-slate">{invoice.recipient}</p>
                </div>
                <InvoiceStatusBadge status={invoice.status} />
              </div>

              <div className="mt-4 flex items-end justify-between gap-3">
                <p className="font-semibold text-arklake-ink">{invoice.amount}</p>
                <p className="shrink-0 text-sm font-medium text-slate">{invoice.date}</p>
              </div>
            </article>
          ))}
        </div>

            <div className="mt-4 hidden overflow-hidden rounded-[1.5rem] border border-lake-border lg:block">
              <table className="w-full min-w-[760px] border-collapse text-left text-sm">
            <thead className="bg-lake-canvas text-xs font-semibold uppercase tracking-[0.14em] text-slate">
              <tr>
                <th className="px-5 py-4">Invoice</th>
                <th className="px-5 py-4">Recipient</th>
                <th className="px-5 py-4">Amount</th>
                <th className="px-5 py-4">Date</th>
                <th className="px-5 py-4">Status</th>
                <th className="w-12 px-5 py-4" aria-label="Actions" />
              </tr>
            </thead>
            <tbody className="divide-y divide-lake-border bg-surface">
              {sortedInvoices.map((invoice) => (
                <tr
                  key={invoice.invoice}
                  className={`transition hover:bg-aqua-mist/30 ${invoice.href ? 'cursor-pointer' : ''}`}
                  onClick={invoice.href ? () => handleInvoiceClick(invoice.href!) : undefined}
                  onKeyDown={invoice.href ? (event) => handleInvoiceKeyDown(event, invoice.href!) : undefined}
                  role={invoice.href ? 'link' : undefined}
                  tabIndex={invoice.href ? 0 : undefined}
                >
                  <td className="px-5 py-5 font-semibold text-arklake-ink">{invoice.href ? <a href={invoice.href} onClick={(event) => handleInvoiceLinkClick(event, invoice.href!)}>{invoice.invoice}</a> : invoice.invoice}</td>
                  <td className="px-5 py-5 font-medium text-slate">{invoice.recipient}</td>
                  <td className="px-5 py-5 font-semibold text-arklake-ink">{invoice.amount}</td>
                  <td className="px-5 py-5 font-medium text-slate">{invoice.date}</td>
                  <td className="px-5 py-5"><InvoiceStatusBadge status={invoice.status} /></td>
                  <td className="px-5 py-5 text-right text-slate">
                    <svg className="ml-auto h-4 w-4" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <path d="m6 4 4 4-4 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </td>
                </tr>
              ))}
            </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </AppShell>
  )
}

type CreateInvoiceErrors = {
  email?: string
  amount?: string
  expiry?: string
}

function ReviewInvoiceRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="py-4 first:pt-0 last:pb-0">
      <p className="text-sm font-semibold text-slate">{label}</p>
      <div className="mt-2 min-w-0 break-words text-lg font-semibold text-arklake-ink [overflow-wrap:anywhere]">{children}</div>
    </div>
  )
}

function AppCreateInvoicePage({ onCreateInvoice, onNavigate }: { onCreateInvoice: (invoice: RuntimeInvoice) => void; onNavigate: (path: string) => void }) {
  const [email, setEmail] = useState('')
  const [amount, setAmount] = useState('')
  const [memo, setMemo] = useState('')
  const [expiry, setExpiry] = useState('7 days')
  const [errors, setErrors] = useState<CreateInvoiceErrors>({})
  const [step, setStep] = useState<'form' | 'review'>('form')

  const validateForm = () => {
    const nextErrors: CreateInvoiceErrors = {}
    const trimmedEmail = email.trim()
    const trimmedAmount = amount.trim()
    const parsedAmount = Number(trimmedAmount)

    if (!trimmedEmail) {
      nextErrors.email = 'Email address is required.'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      nextErrors.email = 'Enter a valid email address.'
    }

    if (trimmedAmount === '') {
      nextErrors.amount = 'Amount is required.'
    } else if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      nextErrors.amount = 'Enter an amount greater than 0.'
    }

    if (!expiry) {
      nextErrors.expiry = 'Choose an expiry.'
    }

    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (validateForm()) {
      setStep('review')
    }
  }

  const handleCreateInvoice = () => {
    const createdAt = new Date()
    const invoice: RuntimeInvoice = {
      id: crypto.randomUUID(),
      billTo: email.trim(),
      amount: amount.trim(),
      asset: 'USDC',
      memo: memo.trim(),
      createdAt,
      expiresAt: getExpiryDate(expiry, createdAt),
      status: 'Unpaid',
    }

    onCreateInvoice(invoice)
    onNavigate(`/app/invoices/${invoice.id}`)
  }

  if (step === 'review') {
    return (
      <AppShell activeItem="Invoices" title="Review invoice" subtitle="Check the details before creating your invoice." onNavigate={onNavigate}>
        <section className="max-w-3xl rounded-[2rem] border border-lake-border bg-surface p-5 shadow-sm sm:p-6">
          <div className="rounded-[1.5rem] border border-lake-border bg-lake-canvas p-5 sm:p-6">
            <h2 className="text-xl font-semibold tracking-[-0.04em] text-arklake-ink">Invoice details</h2>
            <div className="mt-5 divide-y divide-lake-border">
              <ReviewInvoiceRow label="Bill to">{email.trim()}</ReviewInvoiceRow>
              <ReviewInvoiceRow label="Amount">
                <span className="inline-flex max-w-full flex-wrap items-center gap-2">
                  <img className="h-7 w-7 rounded-full" src="/brand/usdc-token.svg" alt="" aria-hidden="true" />
                  <span>{amount.trim()} USDC</span>
                </span>
              </ReviewInvoiceRow>
              <ReviewInvoiceRow label="Memo">{memo.trim() || '—'}</ReviewInvoiceRow>
              <ReviewInvoiceRow label="Expiry">{expiry}</ReviewInvoiceRow>
            </div>
          </div>

          <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
            <button type="button" className="inline-flex items-center justify-center rounded-full border border-lake-border bg-surface px-5 py-2.5 text-sm font-semibold text-arklake-ink shadow-sm" onClick={() => setStep('form')}>
              Back
            </button>
            <button type="button" className="inline-flex items-center justify-center rounded-full bg-arklake-ink px-5 py-2.5 text-sm font-semibold text-white shadow-sm" onClick={handleCreateInvoice}>
              Create invoice
            </button>
          </div>
        </section>
      </AppShell>
    )
  }

  return (
    <AppShell activeItem="Invoices" title="Create invoice" subtitle="Request payment from anyone by email." onNavigate={onNavigate}>
      <form className="max-w-3xl rounded-[2rem] border border-lake-border bg-surface p-5 shadow-sm sm:p-6" onSubmit={handleSubmit} noValidate>
        <div className="grid gap-6">
          <label className="block">
            <span className="text-sm font-semibold text-arklake-ink">Bill to</span>
            <input
              className={`mt-2 w-full rounded-[1.25rem] border bg-surface px-4 py-3 text-base font-medium text-arklake-ink outline-none transition placeholder:text-slate focus:ring-4 focus:ring-arklake-aqua/15 ${errors.email ? 'border-red-300' : 'border-lake-border focus:border-arklake-aqua'}`}
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="client@example.com"
              aria-describedby="create-invoice-email-helper create-invoice-email-error"
              aria-invalid={errors.email ? 'true' : 'false'}
            />
            <span id="create-invoice-email-helper" className="mt-2 block text-sm leading-6 text-slate">We'll send the invoice to this email address.</span>
            {errors.email ? <span id="create-invoice-email-error" className="mt-1 block text-sm font-semibold text-red-600">{errors.email}</span> : null}
          </label>

          <label className="block">
            <span className="text-sm font-semibold text-arklake-ink">Amount</span>
            <div className={`mt-2 flex flex-col gap-3 rounded-[1.25rem] border bg-surface p-2 transition focus-within:ring-4 focus-within:ring-arklake-aqua/15 sm:flex-row sm:items-center ${errors.amount ? 'border-red-300' : 'border-lake-border focus-within:border-arklake-aqua'}`}>
              <input
                className="min-w-0 flex-1 bg-transparent px-2 py-2 text-base font-medium text-arklake-ink outline-none placeholder:text-slate sm:px-3"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="0.00"
                aria-describedby="create-invoice-amount-error"
                aria-invalid={errors.amount ? 'true' : 'false'}
              />
              <div className="inline-flex w-full shrink-0 items-center justify-center gap-2 rounded-full border border-lake-border bg-lake-canvas px-4 py-2.5 text-sm font-semibold text-arklake-ink sm:w-auto">
                <img className="h-7 w-7 rounded-full" src="/brand/usdc-token.svg" alt="" aria-hidden="true" />
                USDC
              </div>
            </div>
            {errors.amount ? <span id="create-invoice-amount-error" className="mt-2 block text-sm font-semibold text-red-600">{errors.amount}</span> : null}
          </label>

          <label className="block">
            <span className="text-sm font-semibold text-arklake-ink">Memo <span className="font-medium text-slate">Optional</span></span>
            <input
              className="mt-2 w-full rounded-[1.25rem] border border-lake-border bg-surface px-4 py-3 text-base font-medium text-arklake-ink outline-none transition placeholder:text-slate focus:border-arklake-aqua focus:ring-4 focus:ring-arklake-aqua/15"
              type="text"
              value={memo}
              onChange={(event) => setMemo(event.target.value)}
              placeholder="Website design"
              aria-describedby="create-invoice-memo-helper"
            />
            <span id="create-invoice-memo-helper" className="mt-2 block text-sm leading-6 text-slate">Add a short description of what this payment is for.</span>
          </label>

          <label className="block">
            <span className="text-sm font-semibold text-arklake-ink">Expiry</span>
            <select
              className={`mt-2 w-full rounded-[1.25rem] border bg-surface px-4 py-3 text-base font-medium text-arklake-ink outline-none transition focus:ring-4 focus:ring-arklake-aqua/15 ${errors.expiry ? 'border-red-300' : 'border-lake-border focus:border-arklake-aqua'}`}
              value={expiry}
              onChange={(event) => setExpiry(event.target.value)}
              aria-describedby="create-invoice-expiry-error"
              aria-invalid={errors.expiry ? 'true' : 'false'}
            >
              <option value="24 hours">24 hours</option>
              <option value="3 days">3 days</option>
              <option value="7 days">7 days</option>
              <option value="30 days">30 days</option>
            </select>
            {errors.expiry ? <span id="create-invoice-expiry-error" className="mt-2 block text-sm font-semibold text-red-600">{errors.expiry}</span> : null}
          </label>
        </div>

        <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <a href="/app/invoices" className="inline-flex items-center justify-center rounded-full border border-lake-border bg-surface px-5 py-2.5 text-sm font-semibold text-arklake-ink shadow-sm" onClick={(event) => {
            event.preventDefault()
            onNavigate('/app/invoices')
          }}>
            Cancel
          </a>
          <button type="submit" className="inline-flex items-center justify-center rounded-full bg-arklake-ink px-5 py-2.5 text-sm font-semibold text-white shadow-sm">
            Continue
          </button>
        </div>
      </form>
    </AppShell>
  )
}

function AppInvoiceDetailPage({ invoice, onNavigate }: { invoice: RuntimeInvoice; onNavigate: (path: string) => void }) {
  const status = getRuntimeInvoiceStatus(invoice)
  const [hasCopiedInvoiceId, setHasCopiedInvoiceId] = useState(false)

  useEffect(() => {
    if (!hasCopiedInvoiceId) return

    const timeoutId = window.setTimeout(() => setHasCopiedInvoiceId(false), 1800)

    return () => window.clearTimeout(timeoutId)
  }, [hasCopiedInvoiceId])

  const handleCopyInvoiceId = async () => {
    await navigator.clipboard.writeText(invoice.id)
    setHasCopiedInvoiceId(true)
  }

  return (
    <AppShell activeItem="Invoices" title="Invoice detail" subtitle="Review this invoice request." onNavigate={onNavigate}>
      <section className="max-w-3xl rounded-[2rem] border border-lake-border bg-surface p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-3 border-b border-lake-border pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate">Invoice ID</p>
            <h2 className="mt-2 break-all text-xl font-semibold tracking-[-0.04em] text-arklake-ink sm:text-2xl">{invoice.id}</h2>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <InvoiceStatusBadge status={status} />
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-full border border-lake-border bg-surface px-3 py-1 text-xs font-semibold text-arklake-ink shadow-sm transition hover:bg-aqua-mist/50"
              onClick={handleCopyInvoiceId}
            >
              {hasCopiedInvoiceId ? 'Copied' : 'Copy invoice ID'}
            </button>
          </div>
        </div>

        {status === 'Expired' ? (
          <div className="mt-5 rounded-[1.5rem] border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            This invoice has expired and can no longer be paid.
          </div>
        ) : null}

        <div className="mt-5 divide-y divide-lake-border">
          <ReviewInvoiceRow label="Bill to">{invoice.billTo}</ReviewInvoiceRow>
          <ReviewInvoiceRow label="Amount">
            <span className="inline-flex max-w-full flex-wrap items-center gap-2">
              <img className="h-7 w-7 rounded-full" src="/brand/usdc-token.svg" alt="" aria-hidden="true" />
              <span>{invoice.amount} {invoice.asset}</span>
            </span>
          </ReviewInvoiceRow>
          <ReviewInvoiceRow label="Memo">{invoice.memo || '—'}</ReviewInvoiceRow>
          <ReviewInvoiceRow label="Created">{formatInvoiceDateTime(invoice.createdAt)}</ReviewInvoiceRow>
          <ReviewInvoiceRow label={status === 'Expired' ? 'Expired at' : 'Expires'}>{formatInvoiceDateTime(invoice.expiresAt)}</ReviewInvoiceRow>
        </div>

        <div className="mt-8">
          <a href="/app/invoices" className="inline-flex items-center justify-center rounded-full border border-lake-border bg-surface px-5 py-2.5 text-sm font-semibold text-arklake-ink shadow-sm" onClick={(event) => {
            event.preventDefault()
            onNavigate('/app/invoices')
          }}>
            Back to invoices
          </a>
        </div>
      </section>
    </AppShell>
  )
}

function AppInvoiceNotFoundPage({ onNavigate }: { onNavigate: (path: string) => void }) {
  return (
    <AppShell activeItem="Invoices" title="Invoice not found" subtitle="This invoice may no longer exist or the link may be invalid." onNavigate={onNavigate}>
      <section className="max-w-3xl rounded-[2rem] border border-lake-border bg-surface p-6 text-center shadow-sm">
        <img
          className="mx-auto h-[154px] w-[206px] object-contain"
          src="/app/illustrations/invoice-empty.svg"
          alt=""
          aria-hidden="true"
        />
        <h2 className="mt-3 text-2xl font-semibold tracking-[-0.05em] text-arklake-ink">Invoice not found</h2>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate">This invoice may no longer exist or the link may be invalid.</p>
        <button
          type="button"
          className="mt-5 rounded-full bg-arklake-ink px-5 py-2.5 text-sm font-semibold text-white shadow-sm"
          onClick={() => onNavigate('/app/invoices')}
        >
          Back to invoices
        </button>
      </section>
    </AppShell>
  )
}

const walletAssets = [
  { symbol: 'USDC', name: 'USD Coin', amount: '320.00', value: '≈ $320.00', icon: '/brand/usdc-token.svg' },
  { symbol: 'EURC', name: 'Euro Coin', amount: '120.00', value: '≈ $130.00', icon: '/brand/eurc-token.png' },
  { symbol: 'CIRBTC', name: 'Circle BTC', amount: '0.0005', value: '≈ $50.00', icon: '/brand/cirbtc-token.png' },
]

const walletActivity = [
  { type: 'Received', amount: '+250.00 USDC', date: 'Aug 30, 2026' },
  { type: 'Sent', amount: '-80.00 USDC', date: 'Aug 29, 2026' },
  { type: 'Swap', amount: '100 EURC → 108 USDC', date: 'Aug 28, 2026' },
  { type: 'Invoice payment', amount: '-120.00 USDC', date: 'Aug 27, 2026' },
]

function TokenIcon({ symbol, icon }: { symbol: string; icon?: string }) {
  if (icon) {
    return <img className="h-10 w-10 rounded-full" src={icon} alt="" aria-hidden="true" />
  }

  return (
    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-aqua-mist text-xs font-semibold text-arklake-aqua" aria-hidden="true">
      {symbol.slice(0, 2)}
    </span>
  )
}

function AppWalletPage({ onNavigate }: { onNavigate: AppNavigateHandler }) {
  return (
    <AppShell activeItem="Wallet" title="Wallet" subtitle="Your money in Arklake." onNavigate={onNavigate}>
      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(340px,0.62fr)]">
        <div className="rounded-[2rem] border border-lake-border bg-surface p-6 shadow-sm">
          <div className="flex min-h-[224px] flex-col items-start justify-between gap-6 overflow-hidden rounded-[1.5rem] bg-gradient-to-br from-white to-aqua-mist/60 px-6 py-6 sm:px-8 lg:flex-row lg:items-center lg:gap-7">
            <div className="relative z-10 min-w-0">
              <p className="text-sm font-semibold text-slate">Available to pay</p>
              <p className="mt-5 whitespace-nowrap text-[2.35rem] font-semibold leading-none tracking-[-0.065em] text-arklake-ink sm:text-5xl">320.00 USDC</p>
              <p className="mt-3 text-sm font-medium text-slate">≈ $320.00 USD</p>
            </div>
            <img className="mx-auto h-auto w-full max-w-[260px] shrink-0 object-contain sm:max-w-[310px] lg:h-[190px] lg:w-[310px]" src="/app/illustrations/wallet-hero.svg" alt="" aria-hidden="true" />
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-1">
          <div className="rounded-[1.75rem] border border-lake-border bg-surface p-5 shadow-sm">
            <p className="text-sm font-semibold text-slate">Total assets</p>
            <p className="mt-4 text-3xl font-semibold tracking-[-0.055em] text-arklake-ink">≈ $500.00 USD</p>
            <p className="mt-2 text-sm leading-6 text-slate">Across demo wallet assets</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-2">
            <div className="min-h-[128px] rounded-[1.75rem] border border-lake-border bg-surface p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-aqua-mist text-arklake-aqua">
                  <svg className="h-5 w-5" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                    <path d="M10 4.5v10M6.25 10.75 10 14.5l3.75-3.75" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <span className="rounded-full border border-lake-border bg-lake-canvas px-2.5 py-1 text-xs font-semibold text-slate">Coming later</span>
              </div>
              <h2 className="mt-4 text-lg font-semibold tracking-[-0.04em] text-arklake-ink">Receive</h2>
              <p className="mt-1 text-sm leading-6 text-slate">Get paid by anyone</p>
            </div>

            <div className="min-h-[128px] rounded-[1.75rem] border border-aqua-mist bg-aqua-mist p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-arklake-aqua">
                  <svg className="h-5 w-5" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                    <path d="M10 15.5v-10M6.25 9.25 10 5.5l3.75 3.75" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <span className="rounded-full border border-white/70 bg-white/70 px-2.5 py-1 text-xs font-semibold text-slate">Coming later</span>
              </div>
              <h2 className="mt-4 text-lg font-semibold tracking-[-0.04em] text-arklake-ink">Send</h2>
              <p className="mt-1 text-sm leading-6 text-slate">Pay anyone</p>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <div className="rounded-[2rem] border border-lake-border bg-surface p-6 shadow-sm">
          <div className="flex items-center">
            <h2 className="text-xl font-semibold tracking-[-0.04em] text-arklake-ink">Assets</h2>
          </div>

          <div className="mt-5 divide-y divide-lake-border">
            {walletAssets.map((asset) => (
              <div key={asset.symbol} className="flex items-center justify-between gap-3 py-4 first:pt-0 last:pb-0 sm:gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  <TokenIcon symbol={asset.symbol} icon={asset.icon} />
                  <div className="min-w-0">
                    <p className="font-semibold text-arklake-ink">{asset.symbol}</p>
                    <p className="mt-1 text-sm text-slate">{asset.name}</p>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-semibold text-arklake-ink">{asset.amount}</p>
                  <p className="mt-1 text-sm text-slate">{asset.value}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[2rem] border border-lake-border bg-surface p-6 shadow-sm">
          <div className="flex items-center">
            <h2 className="text-xl font-semibold tracking-[-0.04em] text-arklake-ink">Recent activity</h2>
          </div>

          <div className="mt-5 divide-y divide-lake-border">
            {walletActivity.map((activity) => (
              <div key={`${activity.type}-${activity.date}`} className="flex flex-col gap-2 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <div className="min-w-0">
                  <p className="font-semibold text-arklake-ink">{activity.type}</p>
                  <p className="mt-1 text-sm text-slate">{activity.date}</p>
                </div>
                <p className="font-semibold text-arklake-ink sm:shrink-0 sm:text-right">{activity.amount}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </AppShell>
  )
}

function SwapTokenSelector({ symbol, icon }: { symbol: string; icon: string }) {
  return (
    <div className="inline-flex shrink-0 items-center gap-2 rounded-full border border-lake-border bg-surface py-1.5 pl-2 pr-3 text-sm font-semibold text-arklake-ink shadow-sm" aria-label={`${symbol} token`}>
      <img className="h-7 w-7 rounded-full" src={icon} alt="" aria-hidden="true" />
      {symbol}
    </div>
  )
}

function AppSwapPage({ onNavigate }: { onNavigate: AppNavigateHandler }) {
  const demoBalances = {
    EURC: 120,
    USDC: 320,
  }
  const demoRate = 1.08
  const demoFee = 0.1
  const [step, setStep] = useState<'input' | 'review'>('input')
  const [payAsset, setPayAsset] = useState<'EURC' | 'USDC'>('EURC')
  const [payAmount, setPayAmount] = useState('100')
  const receiveAsset = payAsset === 'EURC' ? 'USDC' : 'EURC'
  const payBalance = demoBalances[payAsset]
  const quoteRate = payAsset === 'EURC' ? demoRate : 1 / demoRate
  const trimmedPayAmount = payAmount.trim()
  const numericPayAmount = Number(trimmedPayAmount)
  const payAmountError = !trimmedPayAmount
    ? 'Amount is required'
    : !Number.isFinite(numericPayAmount)
    ? 'Invalid amount'
    : numericPayAmount <= 0
    ? 'Amount must be greater than 0'
    : numericPayAmount > payBalance
    ? 'Insufficient demo balance'
    : ''
  const hasValidQuote = !payAmountError
  const grossReceive = hasValidQuote ? numericPayAmount * quoteRate : 0
  const estimatedReceived = hasValidQuote ? Math.max(grossReceive - demoFee, 0) : 0
  const payAssetIcon = payAsset === 'EURC' ? '/brand/eurc-token.png' : '/brand/usdc-token.svg'
  const receiveAssetIcon = receiveAsset === 'EURC' ? '/brand/eurc-token.png' : '/brand/usdc-token.svg'
  const formattedPayAmount = hasValidQuote ? numericPayAmount.toFixed(2) : '—'
  const formattedGrossReceive = hasValidQuote ? grossReceive.toFixed(2) : '—'
  const formattedEstimatedReceived = hasValidQuote ? estimatedReceived.toFixed(2) : '—'

  return (
    <AppShell activeItem="Swap" title="Swap" subtitle="Convert your assets." onNavigate={onNavigate}>
      <section className="grid gap-6 lg:grid-cols-[minmax(0,0.92fr)_minmax(340px,0.48fr)]">
        <div className="rounded-[2rem] border border-lake-border bg-surface p-5 shadow-sm sm:p-6">
          <div className="mb-5 flex items-center justify-between gap-3">
            <h2 className="text-xl font-semibold tracking-[-0.04em] text-arklake-ink">{step === 'review' ? 'Review swap' : 'Swap assets'}</h2>
            <span className="rounded-full border border-aqua-mist bg-aqua-mist px-3 py-1.5 text-xs font-semibold text-arklake-ink">Demo quote</span>
          </div>

          {step === 'review' ? (
            <div className="rounded-[1.5rem] border border-lake-border bg-lake-canvas p-5">
              <div className="divide-y divide-lake-border">
                <div className="flex flex-col gap-1 py-3 first:pt-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                  <span className="text-sm font-semibold text-slate">You pay</span>
                  <span className="break-words text-lg font-semibold text-arklake-ink">{formattedPayAmount} {payAsset}</span>
                </div>
                <div className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                  <span className="text-sm font-semibold text-slate">You receive</span>
                  <span className="break-words text-lg font-semibold text-arklake-ink">{formattedGrossReceive} {receiveAsset}</span>
                </div>
                <div className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                  <span className="text-sm font-semibold text-slate">Rate</span>
                  <span className="break-words text-sm font-semibold text-arklake-ink">1 {payAsset} ≈ {quoteRate.toFixed(4)} {receiveAsset}</span>
                </div>
                <div className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                  <span className="text-sm font-semibold text-slate">Demo fee</span>
                  <span className="break-words text-sm font-semibold text-arklake-ink">≈ 0.10 {receiveAsset}</span>
                </div>
                <div className="flex flex-col gap-1 py-3 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                  <span className="text-sm font-semibold text-slate">Estimated received</span>
                  <span className="break-words text-lg font-semibold text-arklake-ink">≈ {formattedEstimatedReceived} {receiveAsset}</span>
                </div>
              </div>

              <p className="mt-5 rounded-[1.25rem] border border-lake-border bg-surface px-4 py-3 text-sm leading-6 text-slate">
                Swap execution will be available when wallet integration is enabled.
              </p>

              <button type="button" className="mt-5 rounded-full border border-lake-border bg-surface px-5 py-2.5 text-sm font-semibold text-arklake-ink shadow-sm" onClick={() => setStep('input')}>
                Back
              </button>
            </div>
          ) : (
            <>
              <div className="rounded-[1.5rem] border border-lake-border bg-lake-canvas p-5">
                <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate">You pay</p>
                    <input
                      className="mt-4 w-full min-w-0 bg-transparent text-4xl font-semibold tracking-[-0.065em] text-arklake-ink outline-none placeholder:text-slate sm:text-5xl"
                      inputMode="decimal"
                      value={payAmount}
                      onChange={(event) => setPayAmount(event.target.value)}
                      aria-label={`Amount to pay in ${payAsset}`}
                    />
                    <div className="mt-4 flex items-center gap-3 text-sm text-slate">
                      <span>Balance: {payBalance.toFixed(2)} {payAsset}</span>
                      <button type="button" className="font-semibold text-arklake-aqua" onClick={() => setPayAmount(String(payBalance))}>Max</button>
                    </div>
                    {payAmountError ? <p className="mt-3 text-sm font-semibold text-red-700">{payAmountError}</p> : null}
                  </div>
                  <SwapTokenSelector symbol={payAsset} icon={payAssetIcon} />
                </div>
              </div>

              <div className="relative flex justify-center py-3">
                <button
                  type="button"
                  className="flex h-11 w-11 items-center justify-center rounded-full border border-lake-border bg-surface text-arklake-aqua shadow-sm"
                  aria-label="Reverse swap direction"
                  onClick={() => setPayAsset((asset) => (asset === 'EURC' ? 'USDC' : 'EURC'))}
                >
                  <svg className="h-5 w-5" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                    <path d="M10 4.5v11M6.5 12 10 15.5 13.5 12" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>

              <div className="rounded-[1.5rem] border border-aqua-mist bg-aqua-mist p-5">
                <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate">You receive</p>
                    <p className="mt-4 text-4xl font-semibold tracking-[-0.065em] text-arklake-ink sm:text-5xl">{hasValidQuote ? grossReceive.toFixed(2) : '—'}</p>
                    <p className="mt-4 text-sm font-medium text-slate">Estimated</p>
                  </div>
                  <SwapTokenSelector symbol={receiveAsset} icon={receiveAssetIcon} />
                </div>
              </div>

              <div className="mt-5 rounded-[1.5rem] border border-lake-border bg-surface px-5 py-4">
                <div className="flex flex-col gap-1 py-2 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                  <span className="text-slate">Rate</span>
                  <span className="font-semibold text-arklake-ink">1 {payAsset} ≈ {quoteRate.toFixed(4)} {receiveAsset}</span>
                </div>
                <div className="flex flex-col gap-1 py-2 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                  <span className="text-slate">Fee</span>
                  <span className="font-semibold text-arklake-ink">≈ 0.10 {receiveAsset}</span>
                </div>
                <div className="flex flex-col gap-1 border-t border-lake-border pt-4 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                  <span className="text-slate">Estimated received</span>
                  <span className="font-semibold text-arklake-ink">{hasValidQuote ? `≈ ${estimatedReceived.toFixed(2)} ${receiveAsset}` : '—'}</span>
                </div>
              </div>

              <button type="button" className="mt-6 w-full rounded-full bg-arklake-ink px-6 py-3 text-sm font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-50" disabled={!hasValidQuote} onClick={() => setStep('review')}>
                Review swap
              </button>
            </>
          )}
        </div>

        <aside className="rounded-[2rem] border border-lake-border bg-surface p-6 shadow-sm">
          <div className="flex flex-col justify-between overflow-hidden rounded-[1.5rem] bg-gradient-to-br from-white to-aqua-mist/60 p-6 lg:min-h-[220px]">
            <div>
              <p className="text-sm font-semibold text-arklake-aqua">Invoice payments</p>
              <h2 className="mt-4 text-3xl font-semibold leading-[1.05] tracking-[-0.055em] text-arklake-ink">Need USDC to pay an invoice?</h2>
              <p className="mt-4 text-sm leading-6 text-slate">Swap another supported asset to USDC before paying.</p>
            </div>
            <a href="/app/invoices" className="mt-8 inline-flex w-fit items-center justify-center rounded-full border border-lake-border bg-surface px-5 py-2.5 text-sm font-semibold text-arklake-ink shadow-sm" onClick={(event) => {
              event.preventDefault()
              onNavigate('/app/invoices')
            }}>
              View invoices
            </a>
          </div>
        </aside>
      </section>
    </AppShell>
  )
}

function AccountRow({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="flex flex-col items-start gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate">{label}</p>
        <p className="mt-1 break-words font-semibold text-arklake-ink">{value}</p>
      </div>
      {detail ? <span className="shrink-0 rounded-full border border-aqua-mist bg-aqua-mist px-3 py-1 text-xs font-semibold text-arklake-ink">{detail}</span> : null}
    </div>
  )
}

function SecurityRow({ label, status }: { label: string; status: string }) {
  const isComingLater = status === 'Coming later'

  return (
    <div className="flex items-center justify-between gap-3 py-4 first:pt-0 last:pb-0 sm:gap-4">
      <p className="font-semibold text-arklake-ink">{label}</p>
      <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${isComingLater ? 'border-lake-border bg-lake-canvas text-slate' : 'border-aqua-mist bg-aqua-mist text-arklake-ink'}`}>
        {status}
      </span>
    </div>
  )
}

function AppAccountPage({ onNavigate }: { onNavigate: AppNavigateHandler }) {
  return (
    <AppShell activeItem="Account" title="Account" subtitle="Manage your profile, wallet and security." onNavigate={onNavigate}>
      <section className="grid gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(340px,0.58fr)]">
        <div className="grid gap-6">
          <section className="rounded-[2rem] border border-lake-border bg-surface p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold tracking-[-0.04em] text-arklake-ink">Profile</h2>
              <button type="button" className="text-sm font-semibold text-arklake-aqua">Edit</button>
            </div>
            <div className="mt-5 divide-y divide-lake-border">
              <AccountRow label="Email" value="duck@example.com" detail="Verified" />
              <AccountRow label="Arklake Name" value="@duck" />
            </div>
          </section>

          <section className="rounded-[2rem] border border-lake-border bg-surface p-6 shadow-sm">
            <div className="flex flex-col items-start justify-between gap-6 overflow-hidden rounded-[1.5rem] bg-gradient-to-br from-white to-aqua-mist/60 p-6 lg:flex-row">
              <div className="min-w-0 flex-1">
                <h2 className="text-xl font-semibold tracking-[-0.04em] text-arklake-ink">Wallet</h2>
                <p className="mt-5 text-sm font-semibold text-slate">Wallet address</p>
                <p className="mt-2 text-xl font-semibold tracking-[-0.05em] text-arklake-ink sm:text-2xl">0xB1f9...446e</p>
                <div className="mt-5 flex flex-wrap gap-3">
                  <button type="button" className="inline-flex items-center gap-2 rounded-full border border-lake-border bg-surface px-4 py-2.5 text-sm font-semibold text-arklake-ink shadow-sm">
                    <svg className="h-4 w-4 text-arklake-aqua" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                      <path d="M7 7V5.5A1.5 1.5 0 0 1 8.5 4h6A1.5 1.5 0 0 1 16 5.5v6A1.5 1.5 0 0 1 14.5 13H13M5.5 7h6A1.5 1.5 0 0 1 13 8.5v6a1.5 1.5 0 0 1-1.5 1.5h-6A1.5 1.5 0 0 1 4 14.5v-6A1.5 1.5 0 0 1 5.5 7Z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                    </svg>
                    Copy
                  </button>
                  <button type="button" className="rounded-full border border-lake-border bg-surface px-4 py-2.5 text-sm font-semibold text-arklake-ink shadow-sm">
                    View on explorer
                  </button>
                </div>
              </div>
              <img className="mx-auto h-auto w-full max-w-[220px] shrink-0 object-contain lg:h-[148px] lg:w-[190px]" src="/app/illustrations/wallet-hero.svg" alt="" aria-hidden="true" />
            </div>
          </section>
        </div>

        <div className="grid gap-6 content-start">
          <section className="rounded-[2rem] border border-lake-border bg-surface p-6 shadow-sm">
            <h2 className="text-xl font-semibold tracking-[-0.04em] text-arklake-ink">Security</h2>
            <div className="mt-5 divide-y divide-lake-border">
              <SecurityRow label="Email" status="Verified" />
              <SecurityRow label="Passkey" status="Enabled" />
              <SecurityRow label="2FA" status="Coming later" />
            </div>
          </section>

          <section className="rounded-[2rem] border border-lake-border bg-surface p-6 shadow-sm">
            <div className="rounded-[1.5rem] border border-lake-border bg-lake-canvas p-5">
              <h2 className="text-xl font-semibold tracking-[-0.04em] text-arklake-ink">Sign out</h2>
              <p className="mt-2 text-sm leading-6 text-slate">End this demo app session on this device.</p>
              <button type="button" className="mt-5 rounded-full bg-arklake-ink px-5 py-2.5 text-sm font-semibold text-white shadow-sm">
                Sign out
              </button>
            </div>
          </section>
        </div>
      </section>
    </AppShell>
  )
}

export default function App() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isMobileProductOpen, setIsMobileProductOpen] = useState(false)
  const [runtimeInvoices, setRuntimeInvoices] = useState<RuntimeInvoice[]>([])
  const [hasHydratedRuntimeInvoices, setHasHydratedRuntimeInvoices] = useState(false)
  const [currentPath, setCurrentPath] = useState(window.location.pathname)
  const [, setRuntimeInvoiceStatusTick] = useState(0)

  useEffect(() => {
    setRuntimeInvoices(loadRuntimeInvoices())
    setHasHydratedRuntimeInvoices(true)
  }, [])

  useEffect(() => {
    if (!hasHydratedRuntimeInvoices) return

    window.localStorage.setItem(runtimeInvoicesStorageKey, JSON.stringify(serializeRuntimeInvoices(runtimeInvoices)))
  }, [hasHydratedRuntimeInvoices, runtimeInvoices])

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setRuntimeInvoiceStatusTick((tick) => tick + 1)
    }, 60000)

    return () => window.clearInterval(intervalId)
  }, [])

  useEffect(() => {
    const handlePopState = () => setCurrentPath(window.location.pathname)
    window.addEventListener('popstate', handlePopState)

    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => {
    window.history.scrollRestoration = 'manual'

    const pendingLandingScroll = window.sessionStorage.getItem(pendingLandingScrollKey)
    if (currentPath === '/' && pendingLandingScroll) {
      window.sessionStorage.removeItem(pendingLandingScrollKey)
      window.requestAnimationFrame(() => scrollToLandingSection(pendingLandingScroll))
      return
    }

    window.scrollTo(0, 0)
  }, [currentPath])

  const handleCreateInvoice = (invoice: RuntimeInvoice) => {
    setRuntimeInvoices((invoices) => [invoice, ...invoices])
  }

  const handleAppNavigate = (path: string) => {
    window.history.pushState(null, '', path)
    setCurrentPath(path)
  }

  const invoiceDetailId = currentPath.startsWith('/app/invoices/') && currentPath !== '/app/invoices/create'
    ? currentPath.slice('/app/invoices/'.length)
    : null
  const selectedInvoice = invoiceDetailId ? runtimeInvoices.find((invoice) => invoice.id === invoiceDetailId) : undefined

  if (currentPath === '/app') {
    return <AppHomePage onNavigate={handleAppNavigate} />
  }

  if (currentPath === '/app/invoices') {
    return <AppInvoicesPage runtimeInvoices={runtimeInvoices} onNavigate={handleAppNavigate} />
  }

  if (currentPath === '/app/invoices/create') {
    return <AppCreateInvoicePage onCreateInvoice={handleCreateInvoice} onNavigate={handleAppNavigate} />
  }


  if (invoiceDetailId) {
    return selectedInvoice ? <AppInvoiceDetailPage invoice={selectedInvoice} onNavigate={handleAppNavigate} /> : <AppInvoiceNotFoundPage onNavigate={handleAppNavigate} />
  }

  if (currentPath === '/app/wallet') {
    return <AppWalletPage onNavigate={handleAppNavigate} />
  }

  if (currentPath === '/app/swap') {
    return <AppSwapPage onNavigate={handleAppNavigate} />
  }

  if (currentPath === '/app/account') {
    return <AppAccountPage onNavigate={handleAppNavigate} />
  }

  if (window.location.pathname === '/docs/getting-started') {
    return <GettingStartedPage />
  }

  if (window.location.pathname === '/docs/invoicing') {
    return <InvoicingPage />
  }

  if (window.location.pathname === '/docs/payments') {
    return <PaymentsPage />
  }

  if (window.location.pathname === '/docs/wallet') {
    return <WalletPage />
  }

  if (window.location.pathname === '/docs/swap') {
    return <SwapPage />
  }

  if (window.location.pathname === '/docs/technical') {
    return <TechnicalPage />
  }

  if (window.location.pathname === '/docs') {
    return <DocsPage />
  }

  if (window.location.pathname === '/about') {
    return <AboutPage />
  }

  return (
    <main className="min-h-screen bg-lake-canvas text-deep-text">
      <header className={`${shellWidth} sticky top-0 z-30 bg-lake-canvas/90 py-6 shadow-[0_1px_0_rgba(20,33,39,0.08)] backdrop-blur-md`}>
        <div className="flex min-w-0 items-center justify-between">
          <a href="/" className="flex items-center text-arklake-ink">
            <ProductMark />
          </a>

          <nav className="hidden items-center gap-8 text-sm font-medium text-slate md:flex" aria-label="Main navigation">
          <div className="group relative">
            <button className="inline-flex items-center gap-1.5 transition hover:text-arklake-ink group-focus-within:text-arklake-ink" type="button">
              <span>Product</span>
              <svg className="h-3 w-3 transition group-hover:rotate-180 group-focus-within:rotate-180" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <path d="M3 4.5 6 7.5l3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            <div className="invisible absolute left-1/2 top-full z-20 w-[21rem] -translate-x-1/2 pt-4 opacity-0 transition duration-150 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
              <div className="rounded-[1.5rem] border border-lake-border bg-surface p-3 shadow-[0_24px_70px_rgba(20,33,39,0.12)]">
                {productNavItems.map(([label, description]) => (
                  <a
                    key={label}
                    className="block rounded-[1.1rem] px-4 py-3 transition hover:bg-aqua-mist/70"
                    href="#product"
                    onClick={(event) => {
                      event.preventDefault()
                      scrollToLandingSection('product')
                    }}
                  >
                    <p className="text-sm font-semibold text-arklake-ink">{label}</p>
                    <p className="mt-1 text-xs leading-5 text-slate">{description}</p>
                  </a>
                ))}
              </div>
            </div>
          </div>
          <a
            className="transition hover:text-arklake-ink"
            href="#how-it-works"
            onClick={(event) => {
              event.preventDefault()
              scrollToLandingSection('how-it-works')
            }}
          >
            How it works
          </a>
          <a className="transition hover:text-arklake-ink" href="/docs">Docs</a>
          </nav>

          <div className="hidden items-center gap-3 sm:flex">
          <a className="hidden text-sm font-semibold text-arklake-ink sm:inline-flex" href="#">Sign in</a>
          <a className="rounded-full bg-arklake-ink px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-deep-text" href="#">
            Get started
          </a>
          </div>

          <button
            className="flex h-11 w-11 items-center justify-center rounded-full border border-lake-border bg-surface text-arklake-ink shadow-sm md:hidden"
            type="button"
            aria-label="Toggle navigation menu"
            aria-expanded={isMobileMenuOpen}
            onClick={() => setIsMobileMenuOpen((isOpen) => !isOpen)}
          >
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              {isMobileMenuOpen ? (
                <path d="M5.5 5.5 14.5 14.5M14.5 5.5 5.5 14.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
              ) : (
                <path d="M4.5 6.5h11M4.5 10h11M4.5 13.5h11" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
              )}
            </svg>
          </button>
        </div>

        {isMobileMenuOpen ? (
          <nav className="mt-5 rounded-[1.65rem] border border-lake-border bg-surface p-3 shadow-[0_22px_64px_rgba(20,33,39,0.10)] md:hidden" aria-label="Mobile navigation">
            <button
              className="flex w-full items-center justify-between rounded-[1.15rem] px-4 py-3 text-left text-sm font-semibold text-arklake-ink transition hover:bg-aqua-mist/70"
              type="button"
              aria-expanded={isMobileProductOpen}
              onClick={() => setIsMobileProductOpen((isOpen) => !isOpen)}
            >
              <span>Product</span>
              <svg className={`h-3.5 w-3.5 text-arklake-aqua transition ${isMobileProductOpen ? 'rotate-180' : ''}`} viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <path d="M3 4.5 6 7.5l3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            {isMobileProductOpen ? (
              <div className="space-y-1 px-2 pb-2">
                {productNavItems.map(([label, description]) => (
                  <a
                    key={label}
                    className="block rounded-[1.1rem] px-4 py-3"
                    href="#product"
                    onClick={(event) => {
                      event.preventDefault()
                      scrollToLandingSection('product')
                    }}
                  >
                    <p className="text-sm font-semibold text-arklake-ink">{label}</p>
                    <p className="mt-1 text-xs leading-5 text-slate">{description}</p>
                  </a>
                ))}
              </div>
            ) : null}

            <div className="mt-1 flex flex-col gap-1 px-1">
              <a
                className="rounded-[1.15rem] px-4 py-3 text-sm font-semibold text-slate"
                href="#how-it-works"
                onClick={(event) => {
                  event.preventDefault()
                  scrollToLandingSection('how-it-works')
                }}
              >
                How it works
              </a>
              <a className="rounded-[1.15rem] px-4 py-3 text-sm font-semibold text-slate" href="/docs">Docs</a>
              <span className="rounded-[1.15rem] px-4 py-3 text-sm font-semibold text-arklake-ink">Sign in</span>
              <span className="mt-2 inline-flex w-full items-center justify-center rounded-full bg-arklake-ink px-6 py-3 text-sm font-semibold text-white shadow-sm">
                Get started
              </span>
            </div>
          </nav>
        ) : null}
      </header>

      <section className={`${shellWidth} grid min-w-0 grid-cols-1 items-center gap-9 pb-7 pt-7 lg:min-h-[calc(100vh-92px)] lg:grid-cols-[1.12fr_0.88fr] lg:gap-12 lg:pb-8 lg:pt-10`}>
        <div className="min-w-0 max-w-[720px]">
          <div className="inline-flex max-w-full items-center gap-2 rounded-full border border-arklake-aqua/30 bg-aqua-mist px-3 py-2 text-xs font-medium text-arklake-ink shadow-sm sm:px-4 sm:text-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-arklake-aqua" />
            Built on Arc. Powered by Circle.
          </div>

          <h1 className="mt-7 max-w-[19rem] text-[1.85rem] font-semibold leading-[1.04] tracking-[-0.07em] text-arklake-ink sm:max-w-[760px] sm:text-6xl lg:text-[4.65rem] lg:leading-[0.92]">
            Stablecoin payments, made simple.
          </h1>

          <p className="mt-5 max-w-[19rem] text-base leading-7 text-slate sm:max-w-[620px] sm:text-xl sm:leading-8">
            Create invoices, receive USDC and pay globally from one secure account.
          </p>

          <div className="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <a className="inline-flex w-full items-center justify-center rounded-full bg-arklake-ink px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-deep-text hover:ring-4 hover:ring-arklake-aqua/15 sm:w-auto" href="#">
              Get started
            </a>
            <a className="inline-flex w-full items-center justify-center rounded-full border border-lake-border bg-surface px-6 py-3 text-sm font-semibold text-arklake-ink transition hover:border-arklake-aqua sm:w-auto" href="#">
              Sign in
            </a>
          </div>

          <div className="mt-9 flex flex-wrap items-center gap-x-5 gap-y-3 text-xs font-medium text-slate sm:gap-x-7 sm:text-sm lg:flex-nowrap">
            {trustItems.map((item) => (
              <div key={item} className="flex items-center gap-2 whitespace-nowrap">
                <TrustIcon />
                {item}
              </div>
            ))}
          </div>
        </div>

        <PaymentVisual />

        <div className="col-span-full flex justify-center text-sm font-medium text-slate lg:-mt-4">
          <div className="flex flex-col items-center gap-2">
            <span>Scroll to explore</span>
            <svg className="h-3.5 w-3.5 text-arklake-aqua" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M3.5 5.25 7 8.75l3.5-3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>
      </section>

      <FeaturesSection />
      <ProductPreviewSection />
      <HowItWorksSection />
      <InfrastructureSection />
      <FinalCtaSection />
      <Footer />
    </main>
  )
}
