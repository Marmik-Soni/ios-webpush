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
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full flex flex-col bg-white text-zinc-900 antialiased font-sans">
        {children}
      </body>
    </html>
  );
}
