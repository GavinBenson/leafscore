import Link from 'next/link'

const links = [
  { href: '/browse', label: 'Browse teas' },
  { href: '/brands', label: 'Brands' },
  { href: '/lists', label: 'Lists' },
  { href: '/terms', label: 'Terms' },
  { href: '/privacy', label: 'Privacy' },
]

export function Footer() {
  return (
    <footer className="footer">
      <nav aria-label="Footer">
        <ul className="footer-links">
          {links.map(({ href, label }) => (
            <li key={href}>
              <Link href={href} className="footer-link">
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <p className="footer-note">LeafScore: community tea ratings and tasting journal.</p>
    </footer>
  )
}
