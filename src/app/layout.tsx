import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "송민 | 119 이송병원 조회",
  description:
    "환자 상태를 공식 치료영역으로 분석하고 NEMC 실시간 수용정보와 Kakao ETA로 병원 후보를 비교하는 119 상황요원 보조 서비스입니다.",
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
