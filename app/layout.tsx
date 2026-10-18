import type { Metadata, Viewport } from 'next';
import { Fredoka, Pixelify_Sans, Silkscreen } from 'next/font/google';
import './globals.css';

const fredoka = Fredoka({
  variable: '--font-playful',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

const silkscreen = Silkscreen({
  variable: '--font-pixel',
  subsets: ['latin'],
  weight: ['400', '700'],
});

const pixelifySans = Pixelify_Sans({
  variable: '--font-title-pixel',
  subsets: ['latin'],
  weight: ['500', '600', '700'],
});

export const metadata: Metadata = {
  metadataBase: new URL('https://crestbound.suncrest.org'),
  applicationName: 'Crestbound',
  title: 'Crestbound | Suncrest Games',
  description: 'Run a new Suncrest skyline challenge each day. Finish fast, collect Light, complete the challenge, and climb the leaderboard.',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Crestbound',
  },
  icons: {
    icon: '/favicon.svg',
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  openGraph: {
    title: 'Crestbound',
    description: 'Run a new Suncrest skyline challenge each day. Finish fast, collect Light, complete the challenge, and climb the leaderboard.',
    url: 'https://crestbound.suncrest.org',
    siteName: 'Suncrest Games',
    images: [{ url: '/og-pixel.webp', width: 1672, height: 941, alt: 'Crestbound daily pixel platformer starring Sunny' }],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image', title: 'Crestbound', description: 'Run a new Suncrest skyline challenge each day. Finish fast, collect Light, complete the challenge, and climb the leaderboard.', images: ['/og-pixel.webp'],
  },
};

export const viewport: Viewport = {
  width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#071316',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${fredoka.variable} ${silkscreen.variable} ${pixelifySans.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
