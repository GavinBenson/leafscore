import Link from 'next/link'

export const metadata = { title: 'Account deleted' }

export default function GoodbyePage() {
  return (
    <div style={{ maxWidth: 600 }}>
      <h1 className="section-title">Your account has been deleted</h1>
      <p>
        Your profile, reviews, favorites, wishlist and photos have been removed, and any
        subscription has been canceled. Thanks for trying LeafScore.
      </p>
      <Link href="/" className="btn btn-primary">
        Back to home
      </Link>
    </div>
  )
}
