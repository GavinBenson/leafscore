import Link from 'next/link'

export const metadata = {
  title: 'Privacy Policy',
  description: 'What LeafScore collects, why, and how to delete or export it.',
}

const UPDATED = 'Last updated: November 2026'

export default function PrivacyPage() {
  return (
    <div style={{ maxWidth: 680, lineHeight: 1.6 }}>
      {/*
        DRAFT: have a lawyer review before launch. Written to describe what the
        app actually does; it is not legal advice and claims no legal compliance.
        Replace support@<your-domain> before going live, and update the lists
        below whenever the app starts collecting or sharing something new.
      */}
      <h1 className="section-title">Privacy Policy</h1>
      <p className="subtle">{UPDATED} (draft, pending legal review)</p>

      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Account:</strong> your email address and name. If you sign in with Google, we also
          receive your Google profile picture. If you sign in with an email link and give no name, we
          give you a neutral name like &quot;Tea drinker 0427&quot;.
        </li>
        <li>
          <strong>What you create:</strong> reviews (scores, notes, brew details, flavor tags),
          review photos, favorites, your wishlist, and tea requests and reports you submit.
        </li>
        <li>
          <strong>Billing:</strong> if you subscribe, we store your Stripe customer ID and your
          subscription status and renewal date. Card details go to Stripe and never reach our
          servers.
        </li>
        <li>
          <strong>Technical:</strong> to limit abuse, we temporarily keep request counters that can
          be tied to your IP address or account. Our hosting provider also keeps standard server logs.
        </li>
      </ul>

      <h2>What is public</h2>
      <p>
        Your display name, avatar, reviews and review photos are visible to anyone on tea pages. New
        accounts also get a public profile page (with your reviews and favorites). You can make your
        profile page private in Settings; that hides the profile page but not your reviews on tea
        pages. Your email address is never shown publicly.
      </p>

      <h2>Who processes it</h2>
      <ul>
        <li>Neon: database hosting.</li>
        <li>Vercel: website hosting and photo storage.</li>
        <li>Resend: sending sign-in emails.</li>
        <li>Stripe: payments and subscriptions.</li>
        <li>Google: sign-in with Google.</li>
      </ul>
      <p>We don&apos;t sell your data and we don&apos;t run advertising.</p>

      <h2>Cookies and storage</h2>
      <p>
        We use a sign-in session cookie (plus short-lived security cookies during sign-in), and your
        browser&apos;s local storage remembers your light or dark theme choice. We don&apos;t use
        analytics or advertising cookies.
      </p>

      <h2>How long we keep it</h2>
      <p>
        We keep your data until you delete your account. Deleting your account removes your profile,
        reviews, photos, favorites, wishlist and sign-in records, and cancels any subscription.
        Photos are deleted from storage on a best-effort basis. Stripe may keep payment records for
        its own legal reasons, and backups may hold data briefly.
      </p>

      <h2>Your choices</h2>
      <ul>
        <li>
          <strong>Download your data:</strong> Settings, then &quot;Download my data&quot; gives you a
          JSON file. It is available to all users.
        </li>
        <li>
          <strong>Delete your account:</strong> Settings, then &quot;Delete my account&quot;.
        </li>
        <li>
          <strong>Edit your name or make your profile private:</strong> Settings.
        </li>
      </ul>

      <h2>Contact</h2>
      <p>
        Privacy questions or requests: <strong>support@&lt;your-domain&gt;</strong>. See also our{' '}
        <Link href="/terms">Terms of Service</Link>.
      </p>
    </div>
  )
}
