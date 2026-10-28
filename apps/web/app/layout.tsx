import type { Metadata } from 'next';
import { Bricolage_Grotesque, IBM_Plex_Mono, Instrument_Sans } from 'next/font/google';
import './globals.css';
import { AnalyticsConsent } from '@/components/AnalyticsConsent';

const instrument = Instrument_Sans({ variable: '--font-instrument', subsets: ['latin'] });
const bricolage = Bricolage_Grotesque({ variable: '--font-bricolage', subsets: ['latin'], weight: ['500', '700', '800'] });
const plexMono = IBM_Plex_Mono({ variable: '--font-plex-mono', subsets: ['latin'], weight: ['400', '500', '600', '700'] });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  title: { default: 'brandbid: the pay-to-rank brand leaderboard', template: '%s · brandbid' },
  description:
    'Brands pay to rank. Half of every payment becomes ad budget that pays people to share them.',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${instrument.variable} ${bricolage.variable} ${plexMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        {children}
        <AnalyticsConsent />
      </body>
    </html>
  );
}
