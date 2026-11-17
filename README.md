# Article to PDF

공개 기사 URL에서 제목, 작성자, 날짜, 출처와 본문을 추출해 읽기 보기로 편집하고 A4 PDF로 저장하는 Next.js 웹 앱입니다.

## 1. 패키지 설치

Node.js 24.15 이상인 24 LTS를 권장합니다. ZIP을 푼 뒤 터미널에서 `article-to-pdf` 폴더를 열고 실행합니다.

```bash
cd article-to-pdf
npm ci
npx playwright-core install chromium --only-shell
```

`npm ci`는 동봉된 `package-lock.json`에 기록된 버전을 설치합니다. Linux에서 브라우저의 시스템 라이브러리가 빠져 있으면 `npx playwright-core install chromium --only-shell --with-deps`를 사용합니다.

이미 Chrome이나 Chromium이 설치되어 있다면 브라우저 다운로드를 건너뛰고 프로젝트 루트의 `.env.local`에 실제 실행 파일 경로를 지정할 수 있습니다.

```dotenv
CHROME_EXECUTABLE_PATH=/usr/bin/chromium
```

macOS의 Chrome 경로 예시는 `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"`입니다. Windows는 Chrome 설치 폴더의 `chrome.exe` 경로를 지정합니다.

## 2. 실행

```bash
npm run dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000)을 엽니다. 첫 화면의 예시 글로 글꼴 변경, 블록 삭제, 되돌리기와 PDF 다운로드를 바로 확인할 수 있습니다.

1. 기사 URL을 넣고 **아티클 불러오기**를 누릅니다.
2. 미리보기의 문단이나 이미지 위에 마우스를 올린 뒤 휴지통을 누릅니다. 터치 화면에는 휴지통이 바로 표시됩니다. **삭제 되돌리기**를 누르면 마지막으로 지운 블록이 원래 순서에 돌아옵니다.
3. 폰트, 글자 크기, 줄 간격, 본문 너비와 색상을 조정합니다. **이미지 숨기기**는 삭제 기록과 별개로 모든 이미지 블록을 숨깁니다.
4. **PDF로 저장하기**를 누릅니다. 현재 보이는 블록만 PDF에 들어갑니다.

## 3. 전체 소스 파일

```
article-to-pdf/
├── app/
│   ├── api/
│   │   ├── image/route.ts
│   │   ├── parse/route.ts
│   │   └── pdf/route.ts
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── lib/
│   ├── article-html.ts
│   ├── article.ts
│   └── remote.ts
├── .gitignore
├── next.config.ts
├── package.json
├── package-lock.json
├── postcss.config.mjs
├── tsconfig.json
└── README.md
```

| 순서 | 파일 | 읽어볼 코드 |
| --- | --- | --- |
| 1 | `app/api/parse/route.ts`, `lib/remote.ts` | URL을 받아 공개 웹의 HTML을 가져옵니다. 리디렉션에서도 접속 대상 주소를 다시 확인합니다. |
| 2 | `lib/article-html.ts` | jsdom과 Mozilla Readability로 본문을 추출한 뒤 DOMPurify로 정리합니다. 지연 로딩 이미지의 실제 주소를 복원하고, 상대 주소를 절대 주소로 변환한 뒤 `{ id, tag, html }`로 나눕니다. 문장 사이의 이미지는 별도 블록으로 분리하고, figure와 캡션은 함께 묶습니다. |
| 3 | `app/page.tsx`, `app/globals.css`, `app/layout.tsx` | 340px 데스크톱 패널과 반응형 미리보기를 구성합니다. 삭제한 ID를 순서대로 저장해 마지막 삭제를 복원합니다. Tailwind와 CSS로 레이아웃 및 상호작용을 구현합니다. |
| 4 | `app/api/image/route.ts` | 미리보기 이미지에 대한 요청을 서버에서 처리합니다. 파싱 API가 반환하는 블록에는 원본 이미지의 절대 URL이 들어 있습니다. |
| 5 | `lib/article.ts`, `app/api/pdf/route.ts` | 미리보기와 PDF가 읽기용 스타일을 공유합니다. PDF API는 남은 블록과 스타일을 검증한 뒤 Chromium으로 렌더링합니다. A4, 20mm 여백, 배경색 인쇄와 이미지·인용구 단위 페이지 나누기를 적용합니다. |
| 6 | `next.config.ts`, `postcss.config.mjs`, `tsconfig.json`, `package.json`, `package-lock.json` | Node.js 의존성, Tailwind, TypeScript, 빌드 설정과 설치 버전을 정의합니다. |

## 4. 빌드 및 Chromium 실행 방식

```bash
npm run typecheck
npm run build
npm start
```

개발 모드, macOS·Windows, Linux ARM64에서는 Playwright가 설치한 로컬 Chromium을 사용합니다. Linux x64 프로덕션에서는 기본으로 `@sparticuz/chromium`을 사용합니다. Linux 프로덕션에서도 Playwright가 설치한 Chromium을 쓰려면 `.env.local`에 `PDF_CHROMIUM=local`을 지정합니다. `CHROME_EXECUTABLE_PATH`를 지정하면 해당 실행 파일이 우선합니다. PDF 생성에는 Chromium을 실행할 수 있는 Node.js 환경이 필요합니다.

본문 너비 600·680·760px는 화면에서 선택할 수 있는 최대 너비입니다. PDF에서는 20mm 여백을 뺀 A4 인쇄 영역에 맞춰 줄이 바뀝니다. Georgia는 시스템에 설치된 폰트를 쓰며, 폰트가 없거나 한글 글리프가 필요한 경우에는 Noto Serif KR을 사용합니다.

기사 본문이 로그인 뒤에 있거나 자바스크립트 실행 후에만 나타나는 사이트에서는 추출이 제한될 수 있습니다. 이미지 URL은 절대 주소로 정규화되며, 원본 서버의 접근 제한, 만료된 링크, 지원 범위 밖의 이미지 형식에 따라 표시가 제한될 수 있습니다.
