import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "DocuMio",
    short_name: "DocuMio",
    description:
      "Archivio intelligente per documenti, pratiche, pagamenti e scadenze.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f5f7ff",
    theme_color: "#4f46e5",
    orientation: "portrait-primary",
    categories: ["productivity", "utilities", "finance"],
    icons: [
      {
        src: "/documio-icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/documio-icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
