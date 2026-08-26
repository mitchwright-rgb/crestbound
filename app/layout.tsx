import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  metadataBase: new URL('https://sunny-crestbound.suncrest-7012.chatgpt.site'),
  title: 'Sunny: Crestbound | Suncrest Games',
  description: 'Run the skyline, recover the lost light, and master Sunny’s double jump and air dash.',
  openGraph: {
    title: 'Sunny: Crestbound',
    description: 'Run the skyline. Recover the lost light.',
    url: 'https://sunny-crestbound.suncrest-7012.chatgpt.site',
    siteName: 'Suncrest Games',
    images: [{ url: '/og-pixel.png', width: 1664, height: 936, alt: 'Sunny: Crestbound daily pixel platformer' }],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image', title: 'Sunny: Crestbound', description: 'Run the skyline. Recover the lost light.', images: ['/og-pixel.png'],
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
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
