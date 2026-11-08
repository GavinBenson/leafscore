import Link from 'next/link'

export const metadata = {
  title: 'Terms of Service',
  description: 'The rules for using LeafScore.',
}

const UPDATED = 'Last updated: November 2026'

export default function TermsPage() {
  return (
    <div style={{ maxWidth: 680, lineHeight: 1.6 }}>
      {/*
        DRAFT: have a lawyer review before launch. Written to describe what the
        app actually does; it is not legal advice and claims no legal compliance.
        Replace support@<your-domain> and check the Premium and refund wording
        before going live.
      */}
      <h1 className="section-title">Terms of Service</h1>
      <p className="subtle">{UPDATED} (draft, pending legal review)</p>

      <h2>Using LeafScore</h2>
      <p>
        LeafScore is a community site for rating teas and keeping a tasting journal. By using it you
        agree to these terms. If you don&apos;t agree, please don&apos;t use the site. You must be at
        least 13 years old to create an account.
      </p>

      <h2>Your account</h2>
      <p>
        You sign in with Google or an email link. You are responsible for activity on your account.
        Pick a display name that isn&apos;t your email address, because it is shown publicly on your
        reviews. You can delete your account at any time from Settings.
      </p>

      <h2>Your content</h2>
      <p>
        You keep ownership of the reviews, notes and photos you post. By posting them you give
        LeafScore permission to store and display them on the site for as long as they are up. Only
        post content you wrote or took yourself and have the right to share. Don&apos;t post anything
        unlawful, hateful, harassing or misleading, or that includes other people&apos;s personal
        information. Reviews and profiles can be reported, and we may remove content or suspend
        accounts that break these rules.
      </p>

      <h2>Premium subscriptions</h2>
      <p>
        Premium is an optional paid plan, billed monthly or yearly through Stripe. It renews
        automatically until you cancel. You can cancel any time under Settings, then Billing, then
        Manage Subscription; you keep Premium until the end of the period you already paid for.
        Prices are shown on the Billing page before you pay.
      </p>
      <p>
        Refunds: payments are generally non-refundable once a billing period has started, except
        where the law requires otherwise. If you were charged by mistake, contact us at{' '}
        <strong>support@&lt;your-domain&gt;</strong> and we will look into it.
      </p>

      <h2>Ratings and tea information</h2>
      <p>
        Scores and tea details come from the community and may be wrong or out of date. They are
        opinions, not facts or advice. Brand and tea names belong to their owners; LeafScore is not
        affiliated with them.
      </p>

      <h2>Availability and changes</h2>
      <p>
        The service is provided &quot;as is&quot;, without promises that it will always be available
        or error free. To the extent the law allows, LeafScore is not liable for indirect or
        consequential losses. We may change these terms; when we do, the date above will change, and
        continuing to use the site means you accept the new version.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about these terms: <strong>support@&lt;your-domain&gt;</strong>. See also our{' '}
        <Link href="/privacy">Privacy Policy</Link>.
      </p>
    </div>
  )
}
