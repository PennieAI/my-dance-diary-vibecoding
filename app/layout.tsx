import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MY DANCE DIARY｜Vibe Coding 练舞打卡",
  description: "一款 Y2K 风格的练舞日记，记录课程难度、打卡进度、课后自评、舞力与实时单节课价。",
  openGraph: {
    title: "MY DANCE DIARY｜Vibe Coding 练舞打卡",
    description: "记录每一次上场、放炮、SOLO 和高光共舞。",
  },
  twitter: {
    card: "summary",
    title: "MY DANCE DIARY｜Vibe Coding 练舞打卡",
    description: "记录每一次上场、放炮、SOLO 和高光共舞。",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        {children}
      </body>
    </html>
  );
}
