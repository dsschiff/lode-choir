import type { Metadata, Viewport } from 'next';
import './styles.css';

export const metadata: Metadata = {
  title: 'Lode Choir',
  description: 'Guide the living citadel Orison through a singing moon.',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icon.svg' },
};

export const viewport: Viewport = { themeColor: '#07090c' };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}<div id="audio-portal" /><script src="/register-sw.js" defer /></body></html>;
}

