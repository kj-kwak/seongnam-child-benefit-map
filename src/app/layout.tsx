import type { Metadata, Viewport } from "next";
import StyleRegistry from "@/components/StyleRegistry";
import { siteUrl } from "@/lib/site";
import "./globals.css";
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: "성남 아동수당 지도 | 우리 동네 사용처 찾기",
  description:
    "아이와 함께하는 일상, 가까운 아동수당 사용처부터. 성남시 가맹점을 지도에서 찾고 저장하세요.",
  openGraph: {
    title: "성남 아동수당 지도",
    description: "우리 동네 아동수당 사용처를 한눈에",
    type: "website",
    locale: "ko_KR",
  },
  icons: { icon: "/favicon.svg" },
  manifest: "/manifest.json",
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f7f7ef",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>
        <StyleRegistry>{children}</StyleRegistry>
      </body>
    </html>
  );
}
