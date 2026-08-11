/*
 * 시각 회귀 촬영 — CSS·마크업을 고치기 전과 후를 같은 조건으로 찍는다.
 *
 *   node tools/visual/shot.js before
 *   node tools/visual/shot.js after  index,stage1
 *
 * 결과는 tools/visual/shots/<라벨>/ 에 쌓이고, compare.js 로 대조한다.
 *
 * ── 결정성을 위해 통제하는 것들 ──
 *  1) 웹폰트를 로컬에 캐시해 매번 같은 바이트를 쓴다.
 *     구글 폰트를 매번 네트워크로 받으면 응답 지연에 따라 줄바꿈이 달라져
 *     같은 코드로도 페이지 높이가 수십 px 씩 흔들린다. (실제로 겪은 문제)
 *  2) 애니메이션·트랜지션을 끄고 .fade-up 을 전부 표시 상태로 만든다.
 *  3) 이미지 로딩과 디코딩이 끝날 때까지 기다린다.
 *  4) 외부 추적 스크립트(Clarity·Meta)는 차단한다 — 화면에 영향은 없고
 *     로딩 타이밍만 흔든다.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { start } = require('./server');

const ROOT = path.resolve(__dirname, '..', '..');
const CACHE = path.join(__dirname, '.fontcache');

const label = process.argv[2];
if (!label) {
  console.error('사용법: node tools/visual/shot.js <라벨> [페이지목록]');
  console.error('  예)   node tools/visual/shot.js before index,stage1');
  process.exit(1);
}
const PAGES = (process.argv[3] || 'index').split(',').map(s => s.trim()).filter(Boolean);

/* @media 경계(600px·768px·900px)를 앞뒤로 끼워 넣어 경계 버그를 잡는다 */
const VIEWPORTS = [
  { name: 'w1440', width: 1440, height: 900 },
  { name: 'w1024', width: 1024, height: 800 },
  { name: 'w0901', width: 901, height: 800 },
  { name: 'w0900', width: 900, height: 800 },
  { name: 'w0768', width: 768, height: 900 },
  { name: 'w0601', width: 601, height: 800 },
  { name: 'w0600', width: 600, height: 800 },
  { name: 'w0390', width: 390, height: 844 },
  { name: 'w0360', width: 360, height: 740 },
];

/** 웹폰트를 디스크에 캐시해 실행 간 동일한 응답을 보장한다 */
async function handleRoute(route) {
  const url = route.request().url();

  if (/clarity\.ms|facebook\.net|facebook\.com/.test(url)) return route.abort();
  if (!/fonts\.googleapis\.com|fonts\.gstatic\.com/.test(url)) return route.continue();

  fs.mkdirSync(CACHE, { recursive: true });
  const key = crypto.createHash('sha1').update(url).digest('hex');
  const bodyFile = path.join(CACHE, key);
  const metaFile = bodyFile + '.json';

  if (fs.existsSync(bodyFile) && fs.existsSync(metaFile)) {
    const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
    return route.fulfill({ status: 200, headers: meta.headers, body: fs.readFileSync(bodyFile) });
  }

  try {
    const res = await route.fetch();
    const body = await res.body();
    const headers = { 'content-type': res.headers()['content-type'] || 'application/octet-stream' };
    fs.writeFileSync(bodyFile, body);
    fs.writeFileSync(metaFile, JSON.stringify({ headers }));
    return route.fulfill({ status: res.status(), headers, body });
  } catch (e) {
    return route.continue();
  }
}

(async () => {
  const outDir = path.join(__dirname, 'shots', label);
  fs.mkdirSync(outDir, { recursive: true });

  const server = await start(ROOT);
  const BASE = `http://127.0.0.1:${server.port}`;
  const browser = await chromium.launch();

  for (const page of PAGES) {
    for (const vp of VIEWPORTS) {
      const ctx = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 1,
        reducedMotion: 'reduce',
      });
      await ctx.route('**/*', handleRoute);

      const p = await ctx.newPage();
      await p.goto(`${BASE}/${page === 'index' ? '' : page + '.html'}`, { waitUntil: 'networkidle' });

      /* 폰트·이미지가 다 뜨고 디코딩까지 끝나야 최종 레이아웃이 확정된다 */
      await p.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all(
          Array.from(document.images)
            .filter(img => !img.complete)
            .map(img => new Promise(res => { img.onload = img.onerror = res; }))
        );
        await Promise.all(Array.from(document.images).map(img => img.decode().catch(() => {})));
      });

      await p.addStyleTag({
        content: `*,*::before,*::after{
          transition:none!important;animation:none!important;scroll-behavior:auto!important;
        }`,
      });
      await p.evaluate(() => {
        document.querySelectorAll('.fade-up').forEach(el => el.classList.add('visible'));
      });

      /* 지연 등장 요소를 깨우기 위해 한 번 훑고 맨 위로 */
      await p.evaluate(async () => {
        const step = window.innerHeight;
        for (let y = 0; y < document.body.scrollHeight; y += step) {
          window.scrollTo(0, y);
          await new Promise(r => setTimeout(r, 30));
        }
        window.scrollTo(0, 0);
      });
      await p.waitForTimeout(600);

      await p.screenshot({ path: path.join(outDir, `${page}-${vp.name}.png`), fullPage: true });
      const h = await p.evaluate(() => document.documentElement.scrollHeight);
      console.log(`  ${page.padEnd(9)} ${vp.name}  ${String(vp.width).padStart(4)}px  높이 ${h}px`);

      await ctx.close();
    }
  }

  await browser.close();
  await server.close();
  console.log(`\n[${label}] 촬영 완료 → tools/visual/shots/${label}/`);
})();
