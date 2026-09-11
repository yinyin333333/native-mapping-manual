/* Reading and navigation use native HTML. JavaScript only improves code copying
   and makes the same configuration identifiers easy to follow. */
(() => {
  'use strict';
  const status = document.getElementById('copy-status');
  let statusTimer;
  const placeholderPattern = /\{(?:tier|id|density|value\d*|signed\d*)\}/g;
  function appendPlaceholders(parent, text) {
    let position = 0;
    for (const match of text.matchAll(placeholderPattern)) {
      parent.append(document.createTextNode(text.slice(position, match.index)));
      const token = document.createElement('span');
      token.className = 'token-placeholder';
      token.textContent = match[0];
      parent.append(token);
      position = match.index + match[0].length;
    }
    parent.append(document.createTextNode(text.slice(position)));
  }

  for (const code of document.querySelectorAll('code')) {
    // Preserve authored line breaks and semantic overlap markers.
    if (code.children.length) continue;
    const text = code.textContent;
    const language = code.dataset.language;
    const fragment = document.createDocumentFragment();
    if (language === 'template') {
      appendPlaceholders(fragment, text);
      code.replaceChildren(fragment);
      continue;
    }
    const tokens = /#[^\n]*|"(?:\\.|[^"\\])*"|'[^'\n]*'|^[\t ]*\[\[?[A-Za-z_][\w.-]*\]\]?|\{(?:tier|id|density|value\d*|signed\d*)\}|\b(?:true|false|null)\b|-?\b\d+(?:\.\d+)?\b|\b[A-Za-z_][\w-]*(?=\s*=)|[{}\[\]=,:]/gm;
    let position = 0;
    for (const match of text.matchAll(tokens)) {
      fragment.append(document.createTextNode(text.slice(position, match.index)));
      const token = match[0];
      const trimmed = token.trimStart();
      let type;
      if (trimmed.startsWith('#')) type = 'comment';
      else if (/^\{(?:tier|id|density|value\d*|signed\d*)\}$/.test(token)) type = 'placeholder';
      else if (/^["']/.test(trimmed)) type = language === 'json' && /^\s*:/.test(text.slice(match.index + token.length)) ? 'key' : 'string';
      else if (/^\[\[?[A-Za-z_]/.test(trimmed)) type = 'table';
      else if (/^(true|false|null)$/.test(token)) type = 'boolean';
      else if (/^-?\d/.test(token)) type = 'number';
      else if (/^[{}\[\]=,:]$/.test(token)) type = 'punctuation';
      else type = 'key';
      const span = document.createElement('span');
      span.className = `token-${type}`;
      if (type === 'string') appendPlaceholders(span, token);
      else span.textContent = token;
      fragment.append(span);
      position = match.index + token.length;
    }
    fragment.append(document.createTextNode(text.slice(position)));
    if (!code.closest('pre') && /^[a-z_][a-z0-9_]*$/.test(text)) code.classList.add('inline-identifier');
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
