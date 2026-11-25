import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "AIO – osobní tracker",
    short_name: "AIO",
    description: "Trénink, výživa, příjmy a portfolio na jednom místě.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#000000",
    theme_color: "#000000",
    lang: "cs",
    categories: ["health", "fitness", "finance", "productivity"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Začít trénink", url: "/workout", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
      { name: "Zapsat jídlo", url: "/nutrition", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
      { name: "Přidat příjem", url: "/income", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
