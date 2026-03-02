import type { Metadata } from "next";
import { Inter } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";
import "../styles/hyros-theme.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const reckless = localFont({
  variable: "--font-reckless",
  src: [
    {
      path: "../../fonts/RecklessStandardS-TRIAL-Regular.woff2",
      weight: "400",
      style: "normal",
    },
  ],
});

export const metadata: Metadata = {
  title: "Logo Fountain",
  description: "Premium direct-response logo design for growth-focused brands.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${reckless.variable} antialiased`}>{children}</body>
    </html>
  );
}
