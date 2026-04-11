import localFont from 'next/font/local';
import { Poppins } from 'next/font/google';
import "./globals.css";

const larken = localFont({
  src: [
    {
      // Note the capital "F" to match your folder
      path: './Fonts/larkenvariablegx.ttf', 
      style: 'normal',
    },
    {
      path: './Fonts/larkenvariableitalicgx.ttf',
      style: 'italic',
    },
  ],
  variable: '--font-larken',
});

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '700', '900'],
  variable: '--font-poppins',
});

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${larken.variable} ${poppins.variable}`}>
      <body className="antialiased">{children}</body>
    </html>
  );
}