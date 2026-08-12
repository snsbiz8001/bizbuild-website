/*
 * OG 공유 카드 렌더러 — tools/og/og-cover.html 을 1200×630 JPG 로 굽는다.
 *
 *   node tools/og/render.js
 *
 * 결과: images/og-cover.jpg (기존 파일 덮어쓰기 → 참조 수정 불필요)
 *
 * ── 엔진 ──
 *  저장소 표준 렌더 스택인 Playwright(chromium)를 재사용한다.
 *  최초 1회 설치:  cd tools/visual && npm install && npx playwright install chromium
 *  playwright 모듈은 tools/visual/node_modules 에서 해석한다(중복 설치 회피).
 *
 * ── 결정성 ──
 *  document.fonts.ready 로 Noto Serif/Sans KR 로딩을 기다린 뒤 촬영한다.
 *  구글 폰트를 네트워크로 받으므로 최초 실행은 온라인이어야 한다.
 *
 * ── 크기 ──
 *  deviceScaleFactor:1 + clip 1200×630 → 정확히 1200×630px 산출(og:image 선언값과 일치).
 *  더 선명한 2x 가 필요하면 DSF 를 2 로 올리되 선언 메타(width/height)와의 정합을 확인할 것.
 */
const path = require('path');
const fs = require('fs');

const PW = path.resolve(__dirname, '..', 'visual', 'node_modules', 'playwright');
let chromium;
try {
  ({ chromium } = require(PW));
} catch (e) {
  console.error('[og] Playwright 를 찾을 수 없습니다. 먼저 엔진을 설치하세요:');
  console.error('     cd tools/visual && npm install && npx playwright install chromium');
  process.exit(1);
}

const HTML = path.resolve(__dirname, 'og-cover.html');
const OUT = path.resolve(__dirname, '..', '..', 'images', 'og-cover.jpg');

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();
  const fileUrl = 'file:///' + HTML.replace(/\\/g, '/');
  await page.goto(fileUrl, { waitUntil: 'networkidle' });

  await page.evaluate(async () => { await document.fonts.ready; });
  await page.waitForTimeout(300);

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  await page.screenshot({
    path: OUT,
    type: 'jpeg',
    quality: 92,
    clip: { x: 0, y: 0, width: 1200, height: 630 },
  });

  await browser.close();
  console.log('[og] 생성 완료 →', OUT);
})().catch(err => { console.error(err); process.exit(1); });
