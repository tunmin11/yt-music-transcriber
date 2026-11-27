import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "YT Music Transcriber",
  description: "Turn a YouTube song into MIDI notes, chords and lyrics",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
