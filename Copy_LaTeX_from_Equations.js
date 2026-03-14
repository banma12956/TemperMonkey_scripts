// ==UserScript==
// @name         Copy LaTeX from Equations
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Click any rendered math equation on ChatGPT or Claude to copy its LaTeX source to clipboard
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @match        https://claude.ai/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // ── All selectors that may wrap a math equation ───────────────────────
  const MATH_SELECTORS = [
    '.katex',
    '.katex-display',
    'mjx-container',
    '.MathJax',
    '.MathJax_Display',
    '.math-inline',
    '.math-display',
    'span.math',
  ].join(', ');

  // ── Inject styles ─────────────────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    .latex-copy-target {
      cursor: pointer !important;
      transition: outline 0.15s ease, background 0.15s ease !important;
      border-radius: 4px !important;
      position: relative;
    }
    .latex-copy-target:hover {
      outline: 2px solid #6d5cff !important;
      background: rgba(109, 92, 255, 0.08) !important;
    }
    .latex-copy-target:active {
      outline-color: #a695ff !important;
      background: rgba(109, 92, 255, 0.16) !important;
    }

    #latex-copy-toast {
      position: fixed;
      bottom: 28px;
      left: 50%;
      transform: translateX(-50%) translateY(20px);
      background: #1e1e2e;
      color: #cdd6f4;
      font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
      font-size: 13px;
      line-height: 1.5;
      padding: 10px 18px;
      border-radius: 10px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.35);
      z-index: 2147483647;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.25s ease, transform 0.25s ease;
      max-width: 600px;
      word-break: break-all;
      white-space: pre-wrap;
      border: 1px solid #45475a;
    }
    #latex-copy-toast.visible {
      opacity: 1;
      pointer-events: auto;
      transform: translateX(-50%) translateY(0);
    }
    #latex-copy-toast .toast-label {
      color: #a6e3a1;
      font-weight: 600;
      margin-right: 6px;
    }
  `;
  document.head.appendChild(style);

  // ── Toast ─────────────────────────────────────────────────────────────
  const toast = document.createElement('div');
  toast.id = 'latex-copy-toast';
  document.body.appendChild(toast);

  let toastTimer = null;
  function showToast(latex) {
    const preview = latex.length > 120 ? latex.slice(0, 120) + '…' : latex;
    toast.innerHTML = `<span class="toast-label">✓ LaTeX copied:</span>${preview}`;
    toast.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('visible'), 2500);
  }

  // ── LaTeX extraction ──────────────────────────────────────────────────

  /** KaTeX: <annotation encoding="application/x-tex"> */
  function extractFromKatex(el) {
    const ann = el.querySelector('annotation[encoding="application/x-tex"]');
    if (ann) return ann.textContent.trim();
    return null;
  }

  /** MathJax v3: mjx-container */
  function extractFromMathJaxV3(el) {
    const c = el.closest('mjx-container') || el.querySelector('mjx-container');
    if (!c) return null;
    if (c.getAttribute('aria-label')) return c.getAttribute('aria-label').trim();
    if (c.dataset.latex) return c.dataset.latex.trim();
    const s = c.querySelector('script[type*="math/tex"]');
    if (s) return s.textContent.trim();
    return null;
  }

  /** MathJax v2: .MathJax */
  function extractFromMathJaxV2(el) {
    const mj = el.closest('.MathJax, .MathJax_Display') || el.querySelector('.MathJax, .MathJax_Display');
    if (!mj) return null;
    const s = mj.parentElement?.querySelector('script[type*="math/tex"]');
    if (s) return s.textContent.trim();
    try {
      const jax = window.MathJax?.Hub?.getJaxFor?.(mj);
      if (jax?.originalText) return jax.originalText.trim();
    } catch (_) {}
    return null;
  }

  /** data-* attributes */
  function extractFromData(el) {
    let node = el;
    for (let i = 0; i < 6 && node; i++) {
      for (const attr of ['data-latex', 'data-tex', 'data-original']) {
        const v = node.getAttribute?.(attr);
        if (v) return v.trim();
      }
      node = node.parentElement;
    }
    return null;
  }

  function getLatex(target) {
    let el = target;
    for (let i = 0; i < 10 && el; i++) {
      const latex =
        extractFromKatex(el) ||
        extractFromMathJaxV3(el) ||
        extractFromMathJaxV2(el) ||
        extractFromData(el);
      if (latex) return latex;
      el = el.parentElement;
    }
    return null;
  }

  // ── Tag math elements ─────────────────────────────────────────────────
  function tagMathElements(root) {
    const els = (root || document).querySelectorAll(MATH_SELECTORS);
    let tagCount = 0;
    els.forEach((el) => {
      if (el.classList.contains('latex-copy-target')) return;
      if (el.closest('.latex-copy-target')) return;
      if (getLatex(el)) {
        el.classList.add('latex-copy-target');
        tagCount++;
      }
    });
    return tagCount;
  }

  // ── MutationObserver ──────────────────────────────────────────────────
  let scanTimeout = null;
  const observer = new MutationObserver(() => {
    // Debounce: Claude streams fast, avoid scanning on every tiny mutation
    clearTimeout(scanTimeout);
    scanTimeout = setTimeout(() => tagMathElements(), 200);
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // Initial + delayed scans
  tagMathElements();
  setTimeout(() => tagMathElements(), 1500);
  setTimeout(() => tagMathElements(), 4000);
  setTimeout(() => tagMathElements(), 8000);

  // ── Click handler ─────────────────────────────────────────────────────
  document.addEventListener('click', (e) => {
    const mathEl = e.target.closest('.latex-copy-target');
    if (!mathEl) return;

    const latex = getLatex(mathEl);
    if (!latex) return;

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    navigator.clipboard.writeText(latex).then(() => {
      showToast(latex);
    }).catch(() => {
      // Fallback: execCommand
      const ta = document.createElement('textarea');
      ta.value = latex;
      ta.style.cssText = 'position:fixed;left:-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      showToast(latex);
    });
  }, true);

  // ── Debug (accessible from console since @grant none) ─────────────────
  window.__latexCopyDebug = function () {
    console.log('%c[Copy LaTeX Debug]', 'color: #6d5cff; font-weight: bold');

    const all = document.querySelectorAll(MATH_SELECTORS);
    console.log(`Found ${all.length} element(s) matching math selectors.`);

    if (all.length === 0) {
      console.log('No math elements found. Dumping all elements with "math" or "katex" in class name:');
      document.querySelectorAll('*').forEach((el) => {
        const cls = el.className?.toString?.() || '';
        if (/math|katex|mjx/i.test(cls)) {
          console.log(' ', el.tagName, cls, el);
        }
      });
    } else {
      all.forEach((el, i) => {
        const latex = getLatex(el);
        const tagged = el.classList.contains('latex-copy-target');
        console.log(
          `  #${i}`,
          el.tagName + '.' + [...el.classList].join('.'),
          tagged ? '✅ tagged' : '❌ NOT tagged',
          latex ? `=> "${latex.slice(0, 80)}…"` : '=> ⚠️ NO LATEX FOUND',
          el
        );
      });
    }

    const tagged = document.querySelectorAll('.latex-copy-target');
    console.log(`\nTotal tagged (clickable): ${tagged.length}`);
  };

  console.log('%c[Copy LaTeX v3] ✓ Loaded', 'color: #a6e3a1; font-weight: bold',
    '— click equations to copy. Run __latexCopyDebug() to inspect.');
})();
