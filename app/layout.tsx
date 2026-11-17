import type { Metadata } from "next";
import "@fontsource-variable/inter";
import "@fontsource-variable/noto-serif-kr";
import "pretendard/dist/web/variable/pretendardvariable.css";
import { readerCss } from "@/lib/article";
import "./globals.css";

export const metadata: Metadata = {
  title: "Article to PDF",
  description: "웹 아티클을 읽기 좋게 정리하고 PDF로 저장하세요.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body><style>{readerCss}</style>{children}</body></html>;
}
