"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SignInButton } from "@/components/SignInButton";

const links = [
  { href: "/", label: "Home" },
  { href: "/browse", label: "Browse" },
  { href: "/log", label: "Log" },
  { href: "/journal", label: "Journal" },
];

export function NavBar() {
  const pathname = usePathname();

  return (
    <nav className="topbar">
      <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
        <Link href="/" className="brand">
          <span className="brand-mark">L</span>
          <span className="brand-word">LeafScore</span>
        </Link>
        <ul className="nav-links">
          {links.map(({ href, label }) => (
            <li key={href}>
              <Link
                href={href}
                className={`nav-link${pathname === href ? " active" : ""}`}
              >
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <ThemeToggle />
        <SignInButton />
      </div>
    </nav>
  );
}
