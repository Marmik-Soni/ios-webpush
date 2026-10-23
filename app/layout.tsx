import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
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
