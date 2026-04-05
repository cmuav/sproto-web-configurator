import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

const title = "Sproto Web Configurator";
const description =
  "Free, open-source browser tool to read, edit, and write settings on Tribunus ESCs (II and III series) over USB. No drivers or desktop software required — powered by WebUSB and the Sproto serial protocol.";
const siteUrl = "https://cmuav.github.io/sproto-web-configurator";

export const metadata: Metadata = {
  title: {
    default: title,
    template: `%s | ${title}`,
  },
  description,
  keywords: [
    "Sproto", "Tribunus ESC", "ESC configurator", "WebUSB", "browser ESC tool",
    "Tribunus II", "Tribunus III", "motor controller", "drone ESC", "UAV",
    "ESC settings", "electronic speed controller", "open source",
  ],
  authors: [{ name: "cmuav", url: "https://github.com/cmuav" }],
  creator: "cmuav",
  metadataBase: new URL(siteUrl),
  openGraph: {
    type: "website",
    locale: "en_US",
    url: siteUrl,
    title,
    description,
    siteName: title,
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
  robots: {
    index: true,
    follow: true,
  },
  alternates: {
    canonical: siteUrl,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>⚡</text></svg>" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebApplication",
              name: title,
              description,
              url: siteUrl,
              applicationCategory: "UtilitiesApplication",
              operatingSystem: "Any (Chrome/Edge with WebUSB)",
              browserRequirements: "Requires WebUSB support (Chrome, Edge, Opera)",
              offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
              author: { "@type": "Organization", name: "cmuav", url: "https://github.com/cmuav" },
            }),
          }}
        />
      </head>
      <body className={`${inter.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  );
}
