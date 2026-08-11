/*
 * 시각 회귀 비교 — 전/후 스크린샷을 픽셀 단위로 대조한다.
 *
 * 사용: node compare.js before after
 *
 * 판정: 다른 픽셀이 1개라도 있으면 실패로 본다.
 *       크기(높이)가 달라진 경우도 즉시 실패 — 레이아웃이 밀렸다는 뜻이다.
 */
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');
const pixelmatch = require('pixelmatch').default || require('pixelmatch');

const [, , A = 'before', B = 'after'] = process.argv;
const dirA = path.join(__dirname, 'shots', A);
const dirB = path.join(__dirname, 'shots', B);
const diffDir = path.join(__dirname, 'shots', `diff-${A}-${B}`);
fs.mkdirSync(diffDir, { recursive: true });

const files = fs.readdirSync(dirA).filter(f => f.endsWith('.png'));
let failed = 0;

console.log(`${A} ↔ ${B} 비교\n`);

for (const f of files) {
  const pa = path.join(dirA, f);
  const pb = path.join(dirB, f);

  if (!fs.existsSync(pb)) {
    console.log(`  ✗ ${f.padEnd(22)} 대응 파일 없음`);
    failed++;
    continue;
  }

  const a = PNG.sync.read(fs.readFileSync(pa));
  const b = PNG.sync.read(fs.readFileSync(pb));

  if (a.width !== b.width || a.height !== b.height) {
    console.log(`  ✗ ${f.padEnd(22)} 크기 변경 ${a.width}x${a.height} → ${b.width}x${b.height}  (높이차 ${b.height - a.height}px)`);
    failed++;
    continue;
  }

  const diff = new PNG({ width: a.width, height: a.height });
  const n = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold: 0.1 });
  const total = a.width * a.height;
  const pct = ((n / total) * 100).toFixed(4);

  if (n === 0) {
    console.log(`  ✓ ${f.padEnd(22)} 완전 동일`);
  } else {
    console.log(`  ✗ ${f.padEnd(22)} 다른 픽셀 ${n.toLocaleString()}개 (${pct}%)`);
    fs.writeFileSync(path.join(diffDir, f), PNG.sync.write(diff));
    failed++;
  }
}

console.log('');
if (failed === 0) {
  console.log(`전부 동일 — ${files.length}장 모두 픽셀 단위로 일치합니다.`);
} else {
  console.log(`${failed}/${files.length}장 불일치 — 차이 이미지: shots/diff-${A}-${B}/`);
}
process.exit(failed === 0 ? 0 : 1);
