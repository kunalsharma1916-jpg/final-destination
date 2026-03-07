import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Final Destination",
  description: "Event finals control system",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <main className="mx-auto min-h-screen w-full max-w-7xl p-4 md:p-6">{children}</main>
      </body>
    </html>
  );
}
