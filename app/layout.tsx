import type { Metadata } from "next";
import "./globals.css";
import { NavBar } from "@/components/NavBar";
import { Footer } from "@/components/Footer";
import { SessionProvider } from "@/components/SessionProvider";
import { siteUrl } from "@/lib/siteUrl";
import { Analytics } from "@/components/Analytics";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: {
    template: "%s · LeafScore",
    default: "LeafScore",
  },
  description: "Discover, rate, and journal your tea experiences.",
  openGraph: {
    type: "website",
    siteName: "LeafScore",
    title: "LeafScore",
    description: "Discover, rate, and journal your tea experiences.",
  },
  twitter: {
    card: "summary_large_image",
    title: "LeafScore",
    description: "Discover, rate, and journal your tea experiences.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("leafscore-theme");if(t==="light"||t==="dark"){document.documentElement.setAttribute("data-theme",t)}}catch(e){}})();`,
          }}
        />
      </head>
      <body>
        <SessionProvider>
          <NavBar />
          <div className="page-container">{children}</div>
          <Footer />
        </SessionProvider>
        <Analytics />
      </body>
    </html>
  );
}
