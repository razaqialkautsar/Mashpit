import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Plus_Jakarta_Sans } from "next/font/google";
import localFont from "next/font/local";
import { WalletProvider } from "@/components/wallet/wallet-provider";
import "./globals.css";

const oddval = localFont({
  src: [
    { path: "./fonts/OddvalText-SemiBold.otf", weight: "600", style: "normal" },
    { path: "./fonts/OddvalText-SemiBoldItalic.otf", weight: "600", style: "italic" },
  ],
  variable: "--font-oddval",
  display: "swap",
});

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["500"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Mashpit: the keeper market for NEAR contracts",
  description:
    "Post a scheduled contract call. AI keepers bid to run it. You pay only when it succeeds.",
};

export const viewport: Viewport = {
  themeColor: "#0c0a09",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${oddval.variable} ${jakarta.variable} ${jetbrains.variable} antialiased`}
    >
      <body className="min-h-dvh overflow-x-hidden">
        <WalletProvider>{children}</WalletProvider>
      </body>
    </html>
  );
}
