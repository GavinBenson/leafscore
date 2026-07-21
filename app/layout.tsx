import type { Metadata } from "next";
import "./globals.css";
import { NavBar } from "@/components/NavBar";
import { SessionProvider } from "@/components/SessionProvider";

export const metadata: Metadata = {
  title: {
    template: "%s | LeafScore",
    default: "LeafScore",
  },
  description: "Discover, rate, and journal your tea experiences.",
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
        </SessionProvider>
      </body>
    </html>
  );
}
