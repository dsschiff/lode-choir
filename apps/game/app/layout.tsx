import type { Metadata, Viewport } from 'next';
import './styles.css';

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

export const metadata: Metadata = {
  title: 'Lode Choir',
  description: 'Guide the living citadel Orison through a singing moon.',
  manifest: `${BASE_PATH}/manifest.webmanifest`,
  icons: { icon: `${BASE_PATH}/icon.svg` },
};

export const viewport: Viewport = { themeColor: '#07090c' };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}<div id="audio-portal" /><script src={`${BASE_PATH}/register-sw.js`} defer /></body></html>;
}

