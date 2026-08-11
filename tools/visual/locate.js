/*
 * 차이가 난 영역의 위치를 찾아, 해당 부분만 잘라 나란히 저장한다.
 * 사용: node locate.js <A> <B> <파일명>
 */
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');
const pixelmatch = require('pixelmatch').default || require('pixelmatch');

const [, , A, B, file] = process.argv;
const a = PNG.sync.read(fs.readFileSync(path.join(__dirname, 'shots', A, file)));
const b = PNG.sync.read(fs.readFileSync(path.join(__dirname, 'shots', B, file)));

const h = Math.min(a.height, b.height);
const diff = new PNG({ width: a.width, height: h });

/* 공통 높이 구간만 비교 */
const crop = (img) => {
  const out = new PNG({ width: img.width, height: h });
  img.data.copy(out.data, 0, 0, img.width * h * 4);
  return out;
};
const ca = crop(a), cb = crop(b);
pixelmatch(ca.data, cb.data, diff.data, a.width, h, { threshold: 0.1 });

/* 다른 픽셀의 y 범위를 행 단위로 집계 */
const rows = [];
for (let y = 0; y < h; y++) {
  let n = 0;
  for (let x = 0; x < a.width; x++) {
    const i = (y * a.width + x) * 4;
    if (diff.data[i] === 255 && diff.data[i + 1] === 0) n++;
  }
  if (n > 0) rows.push({ y, n });
}

if (!rows.length) { console.log('공통 구간에는 차이 없음 (높이 차이만 존재)'); process.exit(0); }

/* 연속 구간으로 묶기 */
const bands = [];
let cur = { from: rows[0].y, to: rows[0].y, total: rows[0].n };
for (let i = 1; i < rows.length; i++) {
  if (rows[i].y - cur.to <= 12) { cur.to = rows[i].y; cur.total += rows[i].n; }
  else { bands.push(cur); cur = { from: rows[i].y, to: rows[i].y, total: rows[i].n }; }
}
bands.push(cur);

console.log(`${file}  (높이 A=${a.height} B=${b.height})`);
console.log(`차이 구간 ${bands.length}개:`);
bands.forEach((band, i) => {
  console.log(`  [${i}] y ${band.from}~${band.to}  (${band.to - band.from + 1}줄, 픽셀 ${band.total}개)`);
});

/* 가장 큰 구간을 잘라 저장 */
const big = bands.sort((x, y) => y.total - x.total)[0];
const pad = 60;
const y0 = Math.max(0, big.from - pad);
const y1 = Math.min(h, big.to + pad);
const ch = y1 - y0;

const outDir = path.join(__dirname, 'shots', 'crop');
fs.mkdirSync(outDir, { recursive: true });
for (const [label, img] of [[A, a], [B, b]]) {
  const c = new PNG({ width: img.width, height: ch });
  img.data.copy(c.data, 0, y0 * img.width * 4, y1 * img.width * 4);
  fs.writeFileSync(path.join(outDir, `${label}-${file}`), PNG.sync.write(c));
}
console.log(`\n가장 큰 구간 y ${y0}~${y1} 을 shots/crop/ 에 저장`);
