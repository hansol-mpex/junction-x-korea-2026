import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "직결119 · 경상북도 중증외상 최종치료 연결",
  description:
    "119 구급상황관리센터 상황요원을 위한 의사결정 보조 도구. 공개 응급의료 데이터로 재전원 없이 최종치료가 가능한 병원 후보를 비교합니다.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
