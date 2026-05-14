import type { Metadata } from "next";
import { Instrument_Serif, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  display: "swap",
  weight: ["400"],
  style: ["normal", "italic"],
});

const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "LabelWatch — FDA recall intelligence for supplement brands",
  description:
    "Multi-channel notifications, peer watch, and ingredient-level filtering on every FDA dietary supplement recall. From $39/mo. By Novique.ai.",
  metadataBase: new URL("https://label.watch"),
  openGraph: {
    title: "LabelWatch — FDA recall intelligence for supplement brands",
    description:
      "FDA gives you 5 keywords. We give you the whole shelf — Slack, Teams, webhooks, peer-watch, ingredient filters. From $39/mo.",
    url: "https://label.watch",
    siteName: "LabelWatch",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "LabelWatch — FDA recall intelligence for supplement brands",
    description:
      "FDA gives you 5 keywords. We give you the whole shelf. From $39/mo.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${instrumentSerif.variable} ${jetbrains.variable} h-full`}
    >
      <body className="min-h-full">
        {/* eslint-disable-next-line react/no-danger -- static hardcoded JSON-LD, no user input */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Organization",
              name: "LabelWatch",
              url: "https://label.watch",
              description:
                "FDA recall intelligence for dietary supplement brands. Multi-channel alerts, ingredient filtering, peer watch, and Amazon TIC compliance checks.",
              contactPoint: {
                "@type": "ContactPoint",
                contactType: "customer support",
                url: "https://label.watch/contact",
              },
            }),
          }}
        />
        {/* eslint-disable-next-line react/no-danger -- static hardcoded JSON-LD, no user input */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "SoftwareApplication",
              name: "LabelWatch",
              applicationCategory: "BusinessApplication",
              operatingSystem: "Web",
              url: "https://label.watch",
              description:
                "Multi-channel FDA dietary supplement recall alerts with ingredient-level filtering, peer watch, and Amazon TIC compliance monitoring.",
              offers: [
                { "@type": "Offer", name: "Starter", price: "39", priceCurrency: "USD" },
                { "@type": "Offer", name: "Pro", price: "99", priceCurrency: "USD" },
                { "@type": "Offer", name: "Team", price: "299", priceCurrency: "USD" },
              ],
            }),
          }}
        />
        {children}
      </body>
    </html>
  );
}
