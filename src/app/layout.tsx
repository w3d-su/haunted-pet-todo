import type { Metadata } from "next";
import { Press_Start_2P } from "next/font/google";
import { LocaleProvider } from "@/components/providers/LocaleProvider";
import { SoundProvider } from "@/components/providers/SoundProvider";
import { CrtOverlay } from "@/components/ui/CrtOverlay";
import { LanguageSwitcher } from "@/components/ui/LanguageSwitcher";
import { MuteToggle } from "@/components/ui/MuteToggle";
import { LOCALE_BOOT_SCRIPT } from "@/lib/i18n/locale";
import "./globals.css";

const pressStart = Press_Start_2P({
  weight: "400",
  subsets: ["latin"],
  display: "swap",
  variable: "--font-press-start",
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
    <html lang="en" className={pressStart.variable} suppressHydrationWarning>
      <body className="antialiased">
        <script dangerouslySetInnerHTML={{ __html: LOCALE_BOOT_SCRIPT }} />
        <noscript>
          <style>{`html { visibility: visible !important; }`}</style>
        </noscript>
        <LocaleProvider>
          <SoundProvider>
            {children}
            <LanguageSwitcher />
            <MuteToggle />
          </SoundProvider>
        </LocaleProvider>
        <CrtOverlay />
      </body>
    </html>
  );
}
