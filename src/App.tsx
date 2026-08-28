function ProductMark() {
  return <img className="h-[30px] w-auto" src="/brand/arklake-mark-trimmed.png" alt="Arklake" />
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
    <div className="relative mx-auto w-full max-w-[620px] lg:ml-auto lg:mr-0" aria-label="Arklake payment flow visual">
      <div className="relative rounded-[2.25rem] border border-lake-border bg-surface p-5 shadow-[0_30px_86px_rgba(20,33,39,0.13)] lg:scale-[1.04] lg:origin-center">
        <div className="rounded-[1.75rem] border border-lake-border bg-lake-canvas p-5 sm:p-6">
          <div className="mb-6 flex items-start justify-between gap-5">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate">Account balance</p>
              <p className="mt-3 text-4xl font-semibold tracking-[-0.05em] text-arklake-ink sm:text-5xl">12,480 USDC</p>
            </div>
            <div className="rounded-full border border-arklake-aqua/30 bg-aqua-mist px-3 py-1 text-sm font-medium text-arklake-ink">
              USDC
            </div>
          </div>

          <div className="rounded-3xl border border-arklake-gold/35 bg-arklake-gold/10 p-4 sm:p-5">
            <div className="flex items-start justify-between gap-5">
              <div>
                <p className="text-sm font-semibold text-deep-text">Invoice received</p>
                <p className="mt-1 text-sm text-slate">Global payment account</p>
              </div>
              <p className="text-base font-semibold text-arklake-ink">+2,400</p>
            </div>
          </div>

          <FlowCue />

          <div className="rounded-3xl border border-arklake-aqua/25 bg-surface p-4 sm:p-5">
            <div className="flex items-start justify-between gap-5">
              <div>
                <p className="text-sm font-semibold text-deep-text">Payment ready</p>
                <p className="mt-1 text-sm text-slate">Verified on-chain</p>
              </div>
              <div className="flex items-center gap-2 rounded-full bg-aqua-mist px-3 py-1 text-xs font-semibold text-arklake-ink">
                <span className="h-1.5 w-1.5 rounded-full bg-arklake-gold" />
                Secure
              </div>
            </div>
          </div>

          <div className="mt-5 flex items-center justify-between rounded-full border border-arklake-aqua/25 bg-aqua-mist px-4 py-3 text-sm text-slate">
            <span>Invoice/payment</span>
            <span className="h-1.5 w-12 rounded-full bg-arklake-aqua" />
            <span className="font-medium text-arklake-ink">Account verified</span>
          </div>
        </div>
      </div>
    </div>
  )
}

const trustItems = ['Self-custody', 'Built on USDC', 'Secured with passkeys', 'On-chain verified']

export default function App() {
  return (
    <main className="min-h-screen bg-lake-canvas text-deep-text">
      <header className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-6 lg:px-8">
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

        <div className="flex items-center gap-3">
          <a className="hidden text-sm font-semibold text-arklake-ink sm:inline-flex" href="#">Sign in</a>
          <a className="rounded-full bg-arklake-ink px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-deep-text" href="#">
            Get started
          </a>
        </div>
      </header>

      <section className="mx-auto grid w-full max-w-7xl items-center gap-9 px-6 pb-7 pt-7 lg:min-h-[calc(100vh-92px)] lg:grid-cols-[1.12fr_0.88fr] lg:gap-12 lg:px-8 lg:pb-8 lg:pt-10">
        <div className="max-w-[720px]">
          <div className="inline-flex items-center gap-2 rounded-full border border-arklake-aqua/30 bg-aqua-mist px-4 py-2 text-sm font-medium text-arklake-ink shadow-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-arklake-aqua" />
            Built on Arc. Powered by Circle.
          </div>

          <h1 className="mt-7 max-w-[760px] text-5xl font-semibold tracking-[-0.07em] text-arklake-ink sm:text-6xl lg:text-[4.65rem] lg:leading-[0.92]">
            Stablecoin payments, made simple.
          </h1>

          <p className="mt-5 max-w-[620px] text-lg leading-8 text-slate sm:text-xl">
            Create invoices, receive USDC and pay globally from one secure account.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <a className="inline-flex items-center justify-center rounded-full bg-arklake-ink px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-deep-text hover:ring-4 hover:ring-arklake-aqua/15" href="#">
              Get started
            </a>
            <a className="inline-flex items-center justify-center rounded-full border border-lake-border bg-surface px-6 py-3 text-sm font-semibold text-arklake-ink transition hover:border-arklake-aqua" href="#">
              Sign in
            </a>
          </div>

          <div className="mt-9 flex flex-wrap items-center gap-x-7 gap-y-3 text-sm font-medium text-slate lg:flex-nowrap">
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
    </main>
  )
}
