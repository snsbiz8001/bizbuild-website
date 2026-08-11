#!/usr/bin/env node
/*
 * CSS 죽은 코드 검사기
 *
 *   node check.js              저장소의 모든 html 검사
 *   node check.js index.html   특정 파일만
 *
 * 세 가지를 본다.
 *   1) 항상 덮이는 선언  — 뒤 규칙에 무조건 져서 적용된 적이 없는 것
 *   2) 대상 없는 규칙    — HTML 에도 JS 에도 그 클래스/ID 가 없는 것
 *   3) 중복 선택자       — 같은 선택자가 여러 곳에 흩어진 것 (죽은 건 아니나 헷갈림)
 *
 * 이 도구는 "어디를 볼지" 만 알려준다. 지울지 말지는 사람이 판단하고,
 * 반드시 tools/visual 의 시각 회귀 테스트로 픽셀 동일을 확인한 뒤 커밋한다.
 */
'use strict';

const fs = require('fs');
const path = require('path');

// ── 적용 범위(scope) 비교 ────────────────────────────────────────────
// later 의 적용 범위가 earlier 를 완전히 포함하면, 순서상 뒤에 있는 later 가
// 언제나 이기므로 earlier 는 죽은 코드다.
//
// 여기서 미디어쿼리를 잘못 다루면 멀쩡한 코드를 죽었다고 오판한다.
// 실제로 처음 만들 때 max-width 만 이해하도록 짰다가
//   @media(min-width:601px) 와 @media(prefers-reduced-motion:reduce) 를
// 기본 규칙으로 잘못 읽어 judgment.html 의 정상 코드 2건을 죽었다고 보고했다.
// 그래서 "증명할 수 있을 때만 포함으로 판정한다" 는 원칙을 지킨다.
function contains(later, earlier) {
  if (later.cond === '') return true;              // 기본 규칙은 모든 상황에 적용
  if (later.cond === earlier.cond) return true;    // 조건이 완전히 같음
  const a = pureMaxWidth(later.cond);
  const b = pureMaxWidth(earlier.cond);
  if (a !== null && b !== null) return a >= b;     // max-width 끼리는 폭으로 비교
  return false;                                    // 그 밖에는 판단 보류(안전)
}

// '@media(max-width:600px)' 처럼 max-width 조건 하나뿐이면 그 값을, 아니면 null
function pureMaxWidth(cond) {
  const m = /^@media\s*\(\s*max-width:\s*(\d+)px\s*\)$/.exec(cond);
  return m ? Number(m[1]) : null;
}

// ── <style> 파싱 ─────────────────────────────────────────────────────
function parse(src) {
  const rules = [];
  let order = 0;

  for (const sm of src.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) {
    const text = sm[1];
    const base = sm.index + sm[0].indexOf(text);
    let i = 0;
    let cond = '';
    let condDepth = 0;

    while (i < text.length) {
      const brace = text.indexOf('{', i);
      if (brace === -1) break;

      const head = text.slice(i, brace).replace(/\/\*[\s\S]*?\*\//g, '').trim();

      if (/^@(media|supports)\b/.test(head)) {
        cond = head.replace(/\s+/g, '');
        condDepth = 1;
        i = brace + 1;
        continue;
      }
      if (head.startsWith('@')) {            // @keyframes·@font-face 는 통째로 건너뛴다
        let depth = 0, j = brace;
        for (; j < text.length; j++) {
          if (text[j] === '{') depth++;
          else if (text[j] === '}') { depth--; if (depth === 0) break; }
        }
        i = j + 1;
        continue;
      }

      const close = text.indexOf('}', brace);
      if (close === -1) break;

      if (head) {
        rules.push({
          cond,
          sel: head.replace(/\s+/g, ' '),
          body: text.slice(brace + 1, close),
          line: src.slice(0, base + brace).split('\n').length,
          order: order++,
        });
      }

      i = close + 1;
      if (condDepth) {                        // 미디어쿼리 블록이 닫혔는지 확인
        const rest = text.slice(i);
        const k = rest.search(/\S/);
        if (k !== -1 && rest[k] === '}') { cond = ''; condDepth = 0; i += k + 1; }
      }
    }
  }
  return rules;
}

// ── 1) 항상 덮이는 선언 ──────────────────────────────────────────────
function findDead(rules) {
  const decls = [];
  for (const r of rules) {
    for (const sel of r.sel.split(',').map(s => s.trim()).filter(Boolean)) {
      for (const chunk of r.body.split(';')) {
        const c = chunk.indexOf(':');
        if (c === -1) continue;
        const prop = chunk.slice(0, c).trim().toLowerCase();
        const val = chunk.slice(c + 1).trim();
        if (!prop) continue;
        decls.push({
          sel, prop, val,
          important: /!important/i.test(val),
          cond: r.cond, line: r.line, order: r.order,
        });
      }
    }
  }

  const groups = new Map();
  for (const d of decls) {
    const k = d.sel + '||' + d.prop;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(d);
  }

  const dead = [];
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    list.sort((a, b) => a.order - b.order);
    for (let a = 0; a < list.length; a++) {
      for (let b = a + 1; b < list.length; b++) {
        if (list[a].important && !list[b].important) continue;  // !important 는 순서를 이긴다
        if (contains(list[b], list[a])) { dead.push({ d: list[a], by: list[b] }); break; }
      }
    }
  }
  return dead;
}

// ── 2) 대상 없는 규칙 ────────────────────────────────────────────────
// JS 가 나중에 붙이는 클래스(.scrolled·.visible·.open 등)를 죽었다고 오판하지
// 않도록, <script> 안의 문자열에 등장하는 이름은 살아있는 것으로 본다.
function findOrphans(src, rules) {
  const noStyle = src.replace(/<style[^>]*>[\s\S]*?<\/style>/g, '');
  const classes = new Set();
  const ids = new Set();
  for (const m of noStyle.matchAll(/class\s*=\s*["']([^"']*)["']/g)) {
    m[1].split(/\s+/).forEach(x => x && classes.add(x));
  }
  for (const m of noStyle.matchAll(/id\s*=\s*["']([^"']*)["']/g)) {
    const v = m[1].trim();
    if (v) ids.add(v);
  }

  const fromJs = new Set();
  for (const sm of src.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)) {
    for (const q of sm[1].matchAll(/['"`]([^'"`\n]{1,80})['"`]/g)) {
      for (const tok of q[1].split(/[\s,]+/)) {
        const name = tok.replace(/^[.#]/, '');
        if (/^[A-Za-z][\w-]*$/.test(name)) fromJs.add(name);
      }
    }
  }

  const alive = (kind, name) =>
    fromJs.has(name) || (kind === '.' ? classes.has(name) : ids.has(name));

  const orphans = [];
  for (const r of rules) {
    const parts = r.sel.split(',').map(s => s.trim()).filter(p => /[.#]/.test(p));
    if (!parts.length) continue;                    // 태그 선택자만 있으면 판단 보류

    const missing = new Set();
    let deadParts = 0;
    for (const p of parts) {
      const names = [...p.matchAll(/([.#])([\w-]+)/g)];
      const gone = names.filter(n => !alive(n[1], n[2]));
      if (gone.length) { deadParts++; gone.forEach(n => missing.add(n[1] + n[2])); }
    }
    if (deadParts === parts.length) {
      orphans.push({ line: r.line, sel: r.sel, missing: [...missing] });
    } else if (deadParts > 0) {
      // 살아있는 이름과 섞인 그룹 선택자 — 죽은 이름만 빼면 된다
      orphans.push({ line: r.line, sel: r.sel, missing: [...missing], partial: true });
    }
  }
  return orphans;
}

// ── 3) 중복 선택자 ───────────────────────────────────────────────────
function findDupes(rules) {
  const seen = new Map();
  for (const r of rules) {
    const k = r.cond + '||' + r.sel;
    if (!seen.has(k)) seen.set(k, []);
    seen.get(k).push(r);
  }
  return [...seen.entries()]
    .filter(([, v]) => v.length > 1)
    .map(([k, v]) => ({ cond: k.split('||')[0], sel: k.split('||')[1], at: v.map(r => r.line) }));
}

// ── 실행 ─────────────────────────────────────────────────────────────
const root = path.resolve(__dirname, '..', '..');
const targets = process.argv.length > 2
  ? process.argv.slice(2)
  : fs.readdirSync(root).filter(f => f.endsWith('.html')).sort();

let totalDead = 0, totalOrphan = 0, totalDupe = 0;

for (const file of targets) {
  const full = path.isAbsolute(file) ? file : path.join(root, file);
  const src = fs.readFileSync(full, 'utf8');
  const rules = parse(src);

  const dead = findDead(rules);
  const orphans = findOrphans(src, rules);
  const dupes = findDupes(rules);

  totalDead += dead.length;
  totalOrphan += orphans.length;
  totalDupe += dupes.length;

  const scope = (c) => c === '' ? '기본' : c;
  console.log(`\n${'─'.repeat(64)}\n${path.basename(full)}  (규칙 ${rules.length}개)`);

  if (dead.length) {
    console.log(`\n  [1] 항상 덮이는 선언 ${dead.length}개 — 지워도 화면이 안 바뀐다`);
    for (const { d, by } of dead) {
      const same = d.val === by.val ? '  (값도 같은 순수 중복)' : '';
      console.log(`      L${d.line} [${scope(d.cond)}] ${d.sel} { ${d.prop}:${d.val} }`);
      console.log(`        └ L${by.line} [${scope(by.cond)}] 의 ${by.prop}:${by.val} 에 항상 짐${same}`);
    }
  }

  if (orphans.length) {
    console.log(`\n  [2] 대상 없는 규칙 ${orphans.length}개 — HTML·JS 어디에도 없다`);
    for (const o of orphans) {
      console.log(`      L${o.line} ${o.sel}`);
      console.log(`        └ 없는 이름: ${o.missing.join(', ')}${o.partial ? '  (그룹 안 일부만 죽음 — 그 이름만 빼면 된다)' : ''}`);
    }
  }

  if (dupes.length) {
    console.log(`\n  [3] 중복 선택자 ${dupes.length}개 — 죽은 건 아니나 고칠 때 헷갈린다`);
    for (const d of dupes) {
      console.log(`      [${scope(d.cond)}] ${d.sel}  →  ${d.at.map(l => 'L' + l).join(', ')}`);
    }
  }

  if (!dead.length && !orphans.length && !dupes.length) console.log('  깨끗함');
}

console.log(`\n${'═'.repeat(64)}`);
console.log(`합계 — 항상 덮이는 선언 ${totalDead}개 / 대상 없는 규칙 ${totalOrphan}개 / 중복 선택자 ${totalDupe}개`);
console.log('지우기 전에 반드시 tools/visual 로 픽셀 동일을 확인할 것.');

process.exitCode = (totalDead || totalOrphan) ? 1 : 0;
