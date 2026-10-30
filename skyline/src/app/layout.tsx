import type { Metadata, Viewport } from 'next';
import { Inter, Abril_Fatface } from 'next/font/google';

import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import './globals.css';

/**
 * next/font downloads both faces at build time and serves them from our own
 * origin, so there is no connection to fonts.gstatic.com on the critical path.
 * `display: swap` is the assignment's requirement; the generated fallback
 * metrics are what keep the swap from shifting layout.
 */
const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

const abril = Abril_Fatface({
  subsets: ['latin'],
  weight: '400',
  display: 'swap',
  variable: '--font-abril',
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

export const metadata: Metadata = {
  // Makes every relative OG image and canonical URL in child pages absolute.
  metadataBase: new URL(siteUrl),
  title: {
    default: 'Skyline — Luxury residences in Delhi NCR',
    template: '%s | Skyline',
  },
  description:
    'Skyline is a 48-storey luxury residential tower in Gurugram. Explore homes, floor plans, amenities and book a site visit.',
  openGraph: {
    type: 'website',
    siteName: 'Skyline',
    locale: 'en_IN',
  },
  twitter: { card: 'summary_large_image' },
};

export const viewport: Viewport = {
  themeColor: '#121110',
  // Pinch-zoom stays available; capping it would fail the accessibility audit.
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN" className={`${inter.variable} ${abril.variable}`}>
      <body className="min-h-dvh antialiased">
        {/* First tab stop on every page — required for keyboard users who
            would otherwise walk the whole nav on each navigation. */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50
                     focus:rounded-full focus:bg-ink-900 focus:px-5 focus:py-3 focus:text-sm
                     focus:font-semibold focus:text-white"
        >
          Skip to content
        </a>
        <SiteHeader />
        <main id="main">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
