import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Gepetto Shield',
  description: 'AI Copilot for Occident Insurance',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className="bg-gray-50 text-gray-900 antialiased">
        {children}
      </body>
    </html>
  );
}
