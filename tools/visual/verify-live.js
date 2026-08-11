/* 실제 운영 사이트에서 추적이 동작하는지 진짜 브라우저로 확인 */
const { chromium } = require('playwright');

const PAGES = ['', 'stage1', 'stage2', 'stage3', 'judgment'];

(async () => {
  const browser = await chromium.launch();
  let bad = 0;

  for (const slug of PAGES) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const p = await ctx.newPage();

    const fbHits = [];
    p.on('request', r => {
      if (/facebook\.com\/tr/.test(r.url())) fbHits.push(r.url());
    });

    await p.goto(`https://bizbuild.kr/${slug}`, { waitUntil: 'networkidle' });
    await p.waitForTimeout(1500);

    const info = await p.evaluate(() => {
      const links = [...document.querySelectorAll('a[href*="quiz.bizbuild.kr"], a[href*="pf.kakao.com"]')];
      return {
        total: links.length,
        tagged: links.filter(a => a.href.includes('src=')).length,
        noopener: links.filter(a => a.target === '_blank' && !a.rel.includes('noopener')).length,
        sample: links.slice(0, 3).map(a => new URL(a.href).searchParams.get('src')),
        hasClarity: typeof window.clarity === 'function',
        hasFbq: typeof window.fbq === 'function',
      };
    });

    const ok = info.total === info.tagged && info.noopener === 0 && info.hasClarity && info.hasFbq;
    if (!ok) bad++;

    console.log(`${ok ? '✓' : '✗'} bizbuild.kr/${slug || '(메인)'}`);
    console.log(`    CTA ${info.tagged}/${info.total} 태깅   noopener 누락 ${info.noopener}`);
    console.log(`    Clarity ${info.hasClarity ? '로드됨' : '없음'}   Meta픽셀 ${info.hasFbq ? '로드됨' : '없음'}   PageView 전송 ${fbHits.length}건`);
    console.log(`    샘플 src: ${info.sample.join(', ')}`);
    await ctx.close();
  }

  await browser.close();
  console.log(bad === 0 ? '\n전체 정상' : `\n${bad}개 페이지 이상`);
  process.exit(bad === 0 ? 0 : 1);
})();
