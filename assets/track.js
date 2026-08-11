/*!
 * bizbuild.kr — CTA 전환 추적
 *
 * 하는 일
 *  1) quiz·카카오 링크에 ?src=페이지-섹션 자동 부착 → 어느 버튼이 유입시켰는지 구분
 *  2) 클릭 시 Clarity 커스텀 이벤트 발송
 *  3) 스크롤 깊이(25/50/75/100%) 기록 → 어디서 이탈하는지 파악
 *
 * 설계 메모
 *  - 링크를 하나하나 고치지 않고 런타임에 일괄 처리한다. 새 CTA를 추가해도 자동 적용된다.
 *  - Clarity 외에 gtag(GA4)·fbq(Meta)가 나중에 설치되면 코드 수정 없이 함께 발송된다.
 *  - 추적 실패가 링크 동작을 막아선 안 되므로 전 구간을 try/catch로 감싼다.
 */
(function () {
  'use strict';

  var QUIZ = 'quiz.bizbuild.kr';
  var KAKAO = 'pf.kakao.com';

  /* 현재 페이지 이름 — /stage1.html, /stage1, / → stage1, index */
  function pageName() {
    var p = location.pathname.replace(/\.html$/, '').replace(/^\/+|\/+$/g, '');
    return p || 'index';
  }

  /* 링크가 속한 섹션 이름 — 가장 가까운 id 있는 section, 없으면 footer/nav */
  function sectionName(el) {
    /* 화면에 떠 있는 버튼은 섹션 밖에 있으므로 먼저 판별한다 */
    if (el.closest('.kakao-float-btn')) return 'float';
    if (el.closest('.sticky')) return 'sticky';

    var s = el.closest('section[id]');
    if (s) return s.id;
    if (el.closest('footer')) return 'footer';
    if (el.closest('nav')) return 'nav';
    return 'body';
  }

  /* 예: index-hero, stage1-cta, index-footer */
  function slot(el) {
    var page = pageName();
    var sec = sectionName(el);
    /* 섹션 id가 이미 페이지 이름으로 시작하면 접두사를 겹쳐 붙이지 않는다 (refund-refund-body 방지) */
    if (sec === page || sec.indexOf(page + '-') === 0) return sec;
    return page + '-' + sec;
  }

  function targetOf(href) {
    if (href.indexOf(QUIZ) > -1) return 'quiz';
    if (href.indexOf(KAKAO) > -1) return 'kakao';
    return null;
  }

  /* 어느 분석 도구가 설치돼 있든 있는 것에만 보낸다 */
  function send(eventName, where) {
    try {
      if (window.clarity) {
        window.clarity('set', 'cta_slot', where);
        window.clarity('event', eventName);
      }
      if (window.gtag) {
        window.gtag('event', eventName, { cta_slot: where });
      }
      if (window.fbq) {
        window.fbq('trackCustom', eventName, { slot: where });
      }
    } catch (e) { /* 추적 실패는 무시 — 링크는 정상 동작해야 한다 */ }
  }

  /* ── 1) 링크에 출처 파라미터 부착 ── */
  function tagLinks() {
    var links = document.querySelectorAll('a[href*="' + QUIZ + '"], a[href*="' + KAKAO + '"]');
    Array.prototype.forEach.call(links, function (a) {
      try {
        var url = new URL(a.href);

        /* judgment.html 처럼 이미 src를 지정한 링크는 건드리지 않는다 */
        if (!url.searchParams.has('src')) {
          url.searchParams.set('src', slot(a));
          a.href = url.toString();
        }

        /* 새 탭으로 열리는 링크의 보안 속성 보강 */
        if (a.target === '_blank' && a.rel.indexOf('noopener') === -1) {
          a.rel = (a.rel ? a.rel + ' ' : '') + 'noopener';
        }
      } catch (e) { /* 잘못된 URL은 건너뛴다 */ }
    });
  }

  /* ── 2) 클릭 이벤트 ── */
  function watchClicks() {
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a[href]');
      if (!a) return;
      var kind = targetOf(a.href);
      if (!kind) return;
      send('cta_' + kind, slot(a));
    }, true); /* 캡처 단계 — 다른 핸들러가 전파를 막아도 집계된다 */
  }

  /* ── 3) 스크롤 깊이 ── */
  function watchScroll() {
    var marks = [25, 50, 75, 100];
    var hit = {};
    var ticking = false;

    function check() {
      ticking = false;
      var doc = document.documentElement;
      var scrollable = doc.scrollHeight - window.innerHeight;
      if (scrollable <= 0) return;

      var pct = (window.scrollY / scrollable) * 100;
      for (var i = 0; i < marks.length; i++) {
        var m = marks[i];
        if (pct >= m && !hit[m]) {
          hit[m] = true;
          send('scroll_' + m, pageName());
        }
      }
    }

    window.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(check);
    }, { passive: true });
  }

  function init() {
    try {
      tagLinks();
      watchClicks();
      watchScroll();
    } catch (e) { /* 무시 */ }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
