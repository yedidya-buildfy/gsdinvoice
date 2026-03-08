import { Link } from 'react-router'
import { DocumentTextIcon, BanknotesIcon, EnvelopeIcon, ChartBarIcon, ShieldCheckIcon, BoltIcon } from '@heroicons/react/24/outline'

export function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-text">
      {/* Header */}
      <header className="border-b border-border/50">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo120.png" alt="BillSync" className="h-10 w-10" />
            <span className="text-xl font-bold">Bill<span className="text-primary">Sync</span></span>
          </div>
          <div className="flex items-center gap-4">
            <Link to="/login" className="text-sm text-text-secondary hover:text-text transition-colors">
              Sign In
            </Link>
            <Link
              to="/signup"
              className="text-sm font-semibold px-5 py-2.5 bg-primary text-white rounded-xl hover:bg-primary-dark transition-colors shadow-lg shadow-primary/30"
            >
              Get Started
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 py-20 text-center">
        <h1 className="text-4xl md:text-5xl font-bold mb-6 leading-tight">
          VAT Declaration Management<br />
          <span className="text-primary">Made Simple</span>
        </h1>
        <p className="text-lg text-text-secondary max-w-2xl mx-auto mb-10">
          Upload invoices, bank statements, and credit card records. BillSync uses AI to extract data,
          match transactions, and prepare your Israeli VAT declarations automatically.
        </p>
        <Link
          to="/signup"
          className="inline-block text-base font-semibold px-8 py-3.5 bg-primary text-white rounded-xl hover:bg-primary-dark transition-colors shadow-lg shadow-primary/30"
        >
          Start Free Trial
        </Link>
      </section>

      {/* Features */}
      <section className="max-w-6xl mx-auto px-6 py-16">
        <div className="grid md:grid-cols-3 gap-8">
          <FeatureCard
            icon={<DocumentTextIcon className="h-7 w-7 text-primary stroke-[1.5]" />}
            title="AI Invoice Extraction"
            description="Upload PDFs, photos, or scanned documents. AI extracts vendor, amounts, VAT, and line items automatically."
          />
          <FeatureCard
            icon={<BanknotesIcon className="h-7 w-7 text-primary stroke-[1.5]" />}
            title="Transaction Matching"
            description="Import bank and credit card statements. BillSync matches invoices to transactions for complete reconciliation."
          />
          <FeatureCard
            icon={<EnvelopeIcon className="h-7 w-7 text-primary stroke-[1.5]" />}
            title="Email Ingestion"
            description="Connect your Gmail to automatically capture invoices from your inbox. No manual uploads needed."
          />
          <FeatureCard
            icon={<ChartBarIcon className="h-7 w-7 text-primary stroke-[1.5]" />}
            title="VAT Reports"
            description="Generate ready-to-file VAT declaration reports with all matched transactions and supporting documents."
          />
          <FeatureCard
            icon={<ShieldCheckIcon className="h-7 w-7 text-primary stroke-[1.5]" />}
            title="Team Collaboration"
            description="Invite your accountant or team members. Role-based access keeps your data secure and organized."
          />
          <FeatureCard
            icon={<BoltIcon className="h-7 w-7 text-primary stroke-[1.5]" />}
            title="Duplicate Detection"
            description="Smart file hashing prevents duplicate uploads. Never process the same invoice twice."
          />
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/50 mt-16">
        <div className="max-w-6xl mx-auto px-6 py-8 flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-text-secondary">
          <span>&copy; {new Date().getFullYear()} BillSync. All rights reserved.</span>
          <div className="flex gap-6">
            <a href="/privacy.html" className="hover:text-text transition-colors">Privacy Policy</a>
            <a href="/terms.html" className="hover:text-text transition-colors">Terms of Service</a>
            <a href="mailto:support@bill-sync.com" className="hover:text-text transition-colors">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  )
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="bg-surface/60 border border-border/50 rounded-2xl p-6">
      <div className="bg-primary/10 p-3 rounded-xl border border-primary/20 inline-block mb-4">
        {icon}
      </div>
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-text-secondary text-sm leading-relaxed">{description}</p>
    </div>
  )
}
