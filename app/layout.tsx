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
  metadataBase: new URL('https://sunny-crestbound.suncrest-7012.chatgpt.site'),
  title: 'Crestbound | Suncrest Games',
  description: 'Guide Sunny across the skyline, recover the lost light, and master the daily run.',
  openGraph: {
    title: 'Crestbound',
    description: 'Guide Sunny across the skyline. Find the light. Beat today’s time.',
    url: 'https://sunny-crestbound.suncrest-7012.chatgpt.site',
    siteName: 'Suncrest Games',
    images: [{ url: '/og-pixel.png', width: 1672, height: 941, alt: 'Crestbound daily pixel platformer starring Sunny' }],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image', title: 'Crestbound', description: 'Guide Sunny across the skyline. Find the light. Beat today’s time.', images: ['/og-pixel.png'],
  },
};

export const viewport: Viewport = {
  width: 'device-width', initialScale: 1, maximumScale: 1, viewportFit: 'cover', themeColor: '#071316',
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
