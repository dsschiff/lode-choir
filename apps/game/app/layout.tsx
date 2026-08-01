import type { Metadata } from 'next';
import './styles.css';

export const metadata: Metadata = {
  title: 'Lode Choir',
  description: 'Guide the living citadel Orison through a singing moon.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}

