import type { NextConfig } from "next";

const config: NextConfig = {
  serverExternalPackages: ["jsdom", "@sparticuz/chromium", "playwright-core"],
  outputFileTracingIncludes: {
    "/api/pdf": [
      "./node_modules/@sparticuz/chromium/bin/**",
      "./node_modules/pretendard/dist/web/variable/pretendardvariable.css",
      "./node_modules/pretendard/dist/web/variable/woff2/**",
      "./node_modules/@fontsource-variable/noto-serif-kr/index.css",
      "./node_modules/@fontsource-variable/noto-serif-kr/files/**",
    ],
  },
};

export default config;
