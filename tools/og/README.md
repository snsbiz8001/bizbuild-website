# OG 공유 카드 생성 (tools/og)

`images/og-cover.jpg` (1200×630, 카카오·페북·트위터 링크 미리보기)를 코드로 재생성한다.

## 구성
- `og-cover.html` — 카드 원본(디자인·문구). **여기만 고치면 된다.**
- `render.js` — Playwright(chromium)로 HTML을 1200×630 JPG로 굽는다.

## 재생성 방법
```bash
# 최초 1회: 렌더 엔진 설치 (저장소 표준 스택인 tools/visual 의 Playwright 재사용)
cd tools/visual && npm install && npx playwright install chromium

# 저장소 루트에서 실행
node tools/og/render.js
# → images/og-cover.jpg 덮어쓰기
```
최초 실행은 구글 폰트(Noto Serif/Sans KR)를 네트워크로 받으므로 온라인이어야 한다.

## 브랜드 표준 (CLAUDE.md 준수)
- 배경 네이비 `#152C5B`, 골드 로고 `#D4AF5F`, 라벨골드 `#E0BD6E`
- 판정 3색(다크배경): 진행 `#2FA57C` / 보류 `#E8AB45` / 중단 `#D65C5C`
- 제목 Noto Serif KR / 본문 Noto Sans KR
- 진행·보류·중단 배지는 판정을 시각으로 전달하는 요소이므로 **존치**

## 주의
- 파일명·경로(`images/og-cover.jpg`)를 바꾸면 전 페이지의 `og:image`/`twitter:image` 참조를 함께 고쳐야 한다. 그대로 덮어쓰는 것이 원칙.
- 크기 1200×630은 og:image 선언값(`og:image:width`/`height`)과 일치해야 한다.
- 이미지 재생성 시 각 페이지 `og:image`/`twitter:image` URL의 `?v=` 숫자를 올려야 카카오 캐시가 갱신됨.
