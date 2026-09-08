import type { Metadata } from "next";
import { Geist_Mono, Instrument_Sans } from "next/font/google";
import "./globals.css";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteNav } from "@/components/site/SiteNav";
import { WalletProvider } from "@/lib/wallet-context";

const instrumentSans = Instrument_Sans({
  variable: "--font-instrument-sans",
  subsets: ["latin"],
});

// Kept for the many places real on-chain values are shown — addresses, hashes,
// wei amounts and rates read far better tabular than in the display face.
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Acoris — Credit that proves itself",
  description:
    "AI-powered DeFi credit backed by cryptographically verified financial activity, on Creditcoin CC3 Testnet.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${instrumentSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-cream text-ink">
        <WalletProvider>
          <SiteNav />
          <div className="flex flex-1 flex-col">{children}</div>
          <SiteFooter />
        </WalletProvider>
      </body>
    </html>
  );
}
