import type { Metadata } from "next";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "VAYU — India's Air, Observed",
  description:
    "Development of Surface AQI & Identification of HCHO Hotspots over India using Satellite Data. A scientific documentary on India's air quality through satellites, atmospheric science, and deep learning.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
