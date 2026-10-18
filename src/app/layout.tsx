import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AccountStatus } from "@/components/account-status";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Sukoon in Color",
  description: "Thoughtful finds, warm colors, and small moments that feel like you.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col"><AccountStatus />{children}</body>
    </html>
  );
}
