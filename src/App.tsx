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

export default function App() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isMobileProductOpen, setIsMobileProductOpen] = useState(false)

  useEffect(() => {
    window.history.scrollRestoration = 'manual'

    const pendingLandingScroll = window.sessionStorage.getItem(pendingLandingScrollKey)
    if (window.location.pathname === '/' && pendingLandingScroll) {
      window.sessionStorage.removeItem(pendingLandingScrollKey)
      window.requestAnimationFrame(() => scrollToLandingSection(pendingLandingScroll))
      return
    }

    window.scrollTo(0, 0)
  }, [])

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
