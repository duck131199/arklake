const shellWidth = 'site-shell'

function ProductMark() {
  return <img className="h-[30px] max-w-full" src="/brand/arklake-mark-trimmed.png" alt="Arklake" />
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
    <section className={`${shellWidth} pb-24 pt-10 lg:pb-28 lg:pt-12`}>
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
            <article key={card.title} className="w-full min-w-0 max-w-full overflow-hidden rounded-[2rem] border border-lake-border bg-surface p-6 shadow-[0_18px_54px_rgba(20,33,39,0.07)]">
              <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${isGold ? 'border border-arklake-gold/35 bg-arklake-gold/10 text-arklake-ink' : isAqua ? 'border border-arklake-aqua/30 bg-aqua-mist text-arklake-aqua' : 'border border-lake-border bg-lake-canvas text-arklake-ink'}`}>
                {card.icon}
              </div>
              <h3 className="mt-6 text-xl font-semibold tracking-[-0.03em] text-arklake-ink">{card.title}</h3>
              <p className="mt-3 text-sm leading-6 text-slate md:min-h-[3.5rem]">{card.description}</p>
              <a className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-arklake-ink" href="#">
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
              <button className="inline-flex min-w-0 items-center justify-center rounded-full bg-arklake-ink px-4 py-2.5 text-sm font-semibold text-white shadow-sm">
                <span className="truncate">Create invoice</span>
              </button>
              <div className="flex shrink-0 items-center gap-2">
                <button className="flex h-10 w-10 items-center justify-center rounded-full border border-lake-border bg-surface text-slate" aria-label="Notifications">
                  <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path d="M4.75 6.9a3.25 3.25 0 0 1 6.5 0v2.35l1 1.85h-8.5l1-1.85V6.9Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                    <path d="M6.75 12.15a1.35 1.35 0 0 0 2.5 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </button>
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
                    <button
                      key={action}
                      className={`min-w-0 rounded-2xl border px-2 py-3 text-xs font-semibold sm:text-sm ${
                        index === 0 ? 'border-arklake-aqua/30 bg-aqua-mist text-arklake-ink' : 'border-lake-border bg-lake-canvas text-arklake-ink'
                      }`}
                    >
                      <span className="truncate">{action}</span>
                    </button>
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

export default function App() {
  return (
    <main className="min-h-screen bg-lake-canvas text-deep-text">
      <header className={`${shellWidth} flex min-w-0 items-center justify-between py-6`}>
        <a href="#" className="flex items-center text-arklake-ink">
          <ProductMark />
        </a>

        <nav className="hidden items-center gap-8 text-sm font-medium text-slate md:flex" aria-label="Main navigation">
          <a className="inline-flex items-center gap-1.5 transition hover:text-arklake-ink" href="#">
            <span>Product</span>
            <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <path d="M3 4.5 6 7.5l3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
          <a className="transition hover:text-arklake-ink" href="#">How it works</a>
          <a className="transition hover:text-arklake-ink" href="#">Docs</a>
        </nav>

        <div className="hidden items-center gap-3 sm:flex">
          <a className="hidden text-sm font-semibold text-arklake-ink sm:inline-flex" href="#">Sign in</a>
          <a className="rounded-full bg-arklake-ink px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-deep-text" href="#">
            Get started
          </a>
        </div>
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
    </main>
  )
}
