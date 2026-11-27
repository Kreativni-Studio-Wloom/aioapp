import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
import { ServiceWorker } from "@/components/service-worker";
import { splashStartupImages } from "@/lib/splash";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin", "latin-ext"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin", "latin-ext"] });

export const metadata: Metadata = {
  title: { default: "AIO", template: "%s · AIO" },
  description: "Trénink, výživa, příjmy a portfolio na jednom místě.",
  applicationName: "AIO",
  appleWebApp: { capable: true, title: "AIO", statusBarStyle: "black-translucent", startupImage: splashStartupImages },
  formatDetection: { telephone: false },
  icons: {
    icon: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
  ],
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const jar = await cookies();
  const theme = jar.get("theme")?.value === "light" ? "light" : "dark";
  const privacy = jar.get("privacy")?.value === "on" ? "on" : "off";
  return (
    <html lang="cs" data-theme={theme} data-privacy={privacy} className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full">
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
