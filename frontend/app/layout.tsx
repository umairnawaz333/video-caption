import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Captionly — AI Video Captions',
  description: 'Free local AI captions burned into your video',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=Anton&family=Bangers&family=Poppins:wght@400;700&family=Bebas+Neue&family=Archivo+Black&family=Luckiest+Guy&family=Pacifico&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased">{children}</body>
    </html>
  );
}
