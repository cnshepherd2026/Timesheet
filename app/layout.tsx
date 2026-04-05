import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "JYM Timesheet",
  description: "JYM Partnership timesheet",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;1,9..40,300&family=DM+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
        {/* Apply dark mode before paint to avoid flash */}
        <script dangerouslySetInnerHTML={{ __html: `
          try {
            if (localStorage.getItem("jym-dark-mode") === "true") {
              document.documentElement.classList.add("dark");
            }
          } catch(e) {}
        `}} />
      </head>
      <body className="font-body bg-paper text-ink antialiased">{children}</body>
    </html>
  );
}
