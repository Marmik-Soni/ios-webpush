import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
import "./globals.css";

const siteUrl =
  process.env.NEXT_PUBLIC_APP_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "https://ios-webpush-xi.vercel.app");

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Push Lab — iOS Web Push Tester",
  description: "Clean, simple Web Push diagnostic tool for iOS, iPadOS, Safari, and Apple APNs.",
  openGraph: {
    title: "Push Lab — iOS Web Push Tester",
    description: "Clean, simple Web Push diagnostic tool for iOS, iPadOS, Safari, and Apple APNs.",
    url: "/",
    siteName: "Push Lab",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Push Lab — iOS Web Push Tester",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Push Lab — iOS Web Push Tester",
    description: "Clean, simple Web Push diagnostic tool for iOS, iPadOS, Safari, and Apple APNs.",
    images: ["/og-image.png"],
  },
  appleWebApp: {
    capable: true,
    title: "Push Lab",
    statusBarStyle: "default",
  },
  icons: {
    apple: "/icons/180",
    icon: "/icons/180",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#ffffff",
  colorScheme: "light",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full bg-slate-50 text-zinc-900" style={{ colorScheme: "light" }}>
      <body className="min-h-full flex flex-col bg-slate-50 text-zinc-900 antialiased font-sans selection:bg-indigo-500 selection:text-white">
        {children}
        <Toaster
          position="top-center"
          richColors
          closeButton
          duration={4000}
          toastOptions={{
            className: "font-sans text-sm shadow-lg",
          }}
        />
      </body>
    </html>
  );
}
