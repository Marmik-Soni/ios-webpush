import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Push Lab",
  description: "iOS/iPadOS Web Push diagnostic tool",
  appleWebApp: {
    capable: true,
    title: "Push Lab",
    statusBarStyle: "default",
  },
  icons: {
    apple: "/icons/180",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#ffffff",
  colorScheme: "light",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full bg-white text-zinc-900" style={{ colorScheme: "light" }}>
      <body className="min-h-full flex flex-col bg-white text-zinc-900 antialiased font-sans">
        {children}
      </body>
    </html>
  );
}
