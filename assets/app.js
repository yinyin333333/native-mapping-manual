/* Reading and navigation use native HTML. JavaScript only improves code copying
   and makes the same configuration identifiers easy to follow. */
(() => {
  'use strict';
  const status = document.getElementById('copy-status');
  let statusTimer;
  function appendIdentities(parent, text) {
    parent.append(document.createTextNode(text));
  }

  for (const code of document.querySelectorAll('code[data-language="toml"]')) {
    const text = code.textContent;
    const fragment = document.createDocumentFragment();
    const tokens = /#[^\n]*|"(?:\\.|[^"\\])*"|\[[\w.\-]+\]|\b(?:true|false)\b|-?\b\d+\b|\b[\w-]+(?=\s*=)/g;
    let position = 0;
    for (const match of text.matchAll(tokens)) {
      appendIdentities(fragment, text.slice(position, match.index));
      const token = match[0];
      const span = document.createElement('span');
      const type = token.startsWith('#') ? 'comment' : token.startsWith('"') ? 'string' : token.startsWith('[') ? 'table' : /^-?\d|^(true|false)$/.test(token) ? 'number' : 'key';
      span.className = `token-${type}`;
      if (type === 'comment') span.textContent = token;
      else appendIdentities(span, token);
      fragment.append(span);
      position = match.index + token.length;
    }
    appendIdentities(fragment, text.slice(position));
    code.replaceChildren(fragment);
  }

  document.addEventListener('click', async event => {
    const button = event.target.closest('[data-copy]');
    if (!button) return;
    const code = button.closest('.code-block')?.querySelector('pre code');
    if (!code) return;
    let copied = false;
    try { await navigator.clipboard.writeText(code.textContent); copied = true; }
    catch {
      const range = document.createRange();
      range.selectNodeContents(code);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      try { copied = document.execCommand('copy'); } catch { /* Leave the text selected. */ }
      if (copied) selection.removeAllRanges();
    }
    clearTimeout(statusTimer);
    status.textContent = copied ? 'Copied.' : 'Text selected. Press Ctrl+C or Command+C to copy.';
    button.textContent = copied ? 'Copied' : 'Copy';
    setTimeout(() => { button.textContent = 'Copy'; }, 1800);
    statusTimer = setTimeout(() => { status.textContent = ''; }, 4000);
  });

  function revealAnchor() {
    let id;
    try { id = decodeURIComponent(location.hash.slice(1)); } catch { return; }
    const target = document.getElementById(id);
    if (!target) return;
    let parent = target;
    while (parent) {
      if (parent.tagName === 'DETAILS') parent.open = true;
      parent = parent.parentElement;
    }
  }
  addEventListener('hashchange', revealAnchor);
  revealAnchor();

  const links = [...document.querySelectorAll('.contents a')].filter(link => link.pathname === location.pathname && link.hash);
  const chapters = [...document.querySelectorAll('main > section')];
  function markChapter() {
    const current = chapters.filter(section => section.getBoundingClientRect().top <= 140).at(-1) || chapters[0];
    links.forEach(link => {
      if (link.hash === `#${current.id}`) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  }
  let queued = false;
  addEventListener('scroll', () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { markChapter(); queued = false; });
  }, { passive: true });
  markChapter();

  // Include folded reference material in a printed copy without changing the page afterward.
  let previouslyOpen = [];
  addEventListener('beforeprint', () => {
    previouslyOpen = [...document.querySelectorAll('details')].filter(node => node.open);
    document.querySelectorAll('details').forEach(node => { node.open = true; });
  });
  addEventListener('afterprint', () => {
    document.querySelectorAll('details').forEach(node => { node.open = previouslyOpen.includes(node); });
  });
})();
