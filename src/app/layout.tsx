import type { Metadata } from "next";
import { Inter, Outfit } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Siam & Greater Indochina Disaster Watch",
  description:
    "Near-real-time monitoring of wildfires, earthquakes, and natural hazards across Thailand, Myanmar, Laos, Cambodia, Vietnam, and Malaysia. Powered by NASA EONET and USGS data feeds.",
  keywords: [
    "disaster watch",
    "Thailand",
    "Indochina",
    "earthquake",
    "wildfire",
    "real-time",
    "monitoring",
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${outfit.variable}`}>
      <head>
        <meta name="theme-color" content="#0B0D13" />
      </head>
      <body className="min-h-screen overflow-hidden font-[family-name:var(--font-inter)]">
        {children}
      </body>
    </html>
  );
}
