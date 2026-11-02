import type { Metadata } from "next";
import { Press_Start_2P } from "next/font/google";
import { CrtOverlay } from "@/components/ui/CrtOverlay";
import "./globals.css";

const pressStart = Press_Start_2P({
  weight: "400",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Haunted Pet To-Do",
  description:
    "A spooky to-do list where finishing tasks keeps a little ghost pet alive.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${pressStart.className} antialiased`}>
        {children}
        <CrtOverlay />
      </body>
    </html>
  );
}
