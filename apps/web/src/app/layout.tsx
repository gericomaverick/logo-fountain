import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { SafePerformanceMeasure } from "@/components/safe-performance-measure";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://app.logofountain.co.uk"),
  title: {
    default: "Logo Fountain Portal",
    template: "%s | Logo Fountain Portal",
  },
  description: "Client and admin portal for Logo Fountain projects.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="antialiased">
        <SafePerformanceMeasure />
        {children}
      </body>
    </html>
  );
}
