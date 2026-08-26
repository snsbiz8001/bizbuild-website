/*
 * 줄바꿈 측정 — 폭별로 각 요소가 몇 줄에 어떻게 끊기는지만 뽑는다.
 * 사용: node check.js <URL>
 *
 * 이 도구는 측정만 한다. 좋다·나쁘다 판단은 하지 않으며 이미지도 남기지 않는다.
 * 최종 확인은 실기기로 사람이 한다. (tools/linebreak-check/README.md 참고)
 */
const fs = require('fs');
const path = require('path');

const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
const SELECTORS = cfg.selectors;
const WIDTHS = cfg.widths || [320, 375, 480, 481, 600, 601, 768, 1200];

const url = process.argv[2];
if (!url) {
  console.error('사용: node check.js <URL>');
  console.error('예:   node check.js http://localhost:8000/');
  process.exit(1);
}

/*
 * 한 요소의 렌더링 결과를 줄 단위로 쪼갠다.
 * 글자 하나씩 Range 를 잡아 화면상 y 좌표를 읽고, y 가 바뀌는 지점을 줄바꿈으로 본다.
 * CSS 자동 줄바꿈이든 <br> 이든 실제로 눈에 보이는 대로 잡힌다.
 */
function extractLines(el) {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const lines = [];
  let cur = null;
  const EPS = 1.5; /* 같은 줄로 볼 y 오차 (px) */
  let node;

  while ((node = walker.nextNode())) {
    const text = node.textContent;
    for (let i = 0; i < text.length; i++) {
      const range = document.createRange();
      range.setStart(node, i);
      range.setEnd(node, i + 1);
      const rect = range.getBoundingClientRect();

      /* 줄 끝에서 폭이 0 으로 접히는 공백 등은 현재 줄에 그대로 붙인다 */
      if (rect.width === 0 && rect.height === 0) {
        if (cur) cur.text += text[i];
        continue;
      }
      if (!cur || Math.abs(rect.top - cur.top) > EPS) {
        cur = { top: rect.top, text: text[i] };
        lines.push(cur);
      } else {
        cur.text += text[i];
      }
    }
  }
  return lines
    .map((l) => l.text.replace(/\s+/g, ' ').trim())
    .filter((s) => s.length > 0);
}

(async () => {
  /* 의존성이 없을 때 usage 대신 모듈 오류가 뜨지 않도록 인자 검사 뒤에 부른다 */
  let chromium;
  try {
    ({ chromium } = require('playwright'));
  } catch (e) {
    console.error('playwright 가 설치되어 있지 않다. 독립 WSL 터미널에서:');
    console.error('  cd tools/linebreak-check && npm run setup');
    process.exit(1);
  }

  const browser = await chromium.launch();
  const page = await browser.newPage();

  /* results[selector][width] = [{ index, lines }, ...] */
  const results = {};
  SELECTORS.forEach((s) => { results[s] = {}; });

  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(url, { waitUntil: 'networkidle' });
    /* 웹폰트가 붙기 전에 재면 자폭이 달라 줄바꿈이 다르게 나온다 */
    await page.evaluate(() => document.fonts.ready);

    for (const selector of SELECTORS) {
      results[selector][width] = await page.evaluate(
        ({ selector, fnSource }) => {
          const extract = new Function('return ' + fnSource)();
          return [...document.querySelectorAll(selector)].map((el, index) => ({
            index: index + 1,
            lines: extract(el),
          }));
        },
        { selector, fnSource: extractLines.toString() }
      );
    }
  }

  await browser.close();

  /* ── 출력: 선택자별로 묶고, 그 안에서 폭 오름차순 ── */
  const COL1 = 26, COL2 = 6, COL3 = 5;
  const pad = (s, n) => String(s).padEnd(n);
  const padL = (s, n) => String(s).padStart(n);

  console.log(`URL   : ${url}`);
  console.log(`폭    : ${WIDTHS.join(', ')}`);
  console.log(`선택자: ${SELECTORS.length}개`);
  console.log('');

  for (const selector of SELECTORS) {
    const counts = WIDTHS.map((w) => results[selector][w].length);
    const found = Math.max(...counts, 0);

    console.log('='.repeat(96));
    console.log(`${selector}  (일치 요소 ${found}개)`);
    console.log('='.repeat(96));

    if (found === 0) {
      console.log('일치하는 요소 없음');
      console.log('');
      continue;
    }

    console.log(
      `${pad('요소', COL1)}| ${padL('폭', COL2)} | ${padL('줄수', COL3)} | 줄별 텍스트`
    );
    console.log(`${'-'.repeat(COL1)}+${'-'.repeat(COL2 + 2)}+${'-'.repeat(COL3 + 2)}+${'-'.repeat(56)}`);

    for (let i = 1; i <= found; i++) {
      for (const width of WIDTHS) {
        const el = results[selector][width].find((e) => e.index === i);
        const lines = el ? el.lines : [];
        const label = `${selector}[${i}]`;

        if (lines.length === 0) {
          console.log(
            `${pad(label, COL1)}| ${padL(width, COL2)} | ${padL(0, COL3)} | (렌더링된 텍스트 없음)`
          );
          continue;
        }
        lines.forEach((line, k) => {
          const c1 = k === 0 ? pad(label, COL1) : pad('', COL1);
          const c2 = k === 0 ? padL(width, COL2) : padL('', COL2);
          const c3 = k === 0 ? padL(lines.length, COL3) : padL('', COL3);
          console.log(`${c1}| ${c2} | ${c3} | ${k + 1}. ${line}`);
        });
      }
      if (i < found) {
        console.log(`${'-'.repeat(COL1)}+${'-'.repeat(COL2 + 2)}+${'-'.repeat(COL3 + 2)}+${'-'.repeat(56)}`);
      }
    }
    console.log('');
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
