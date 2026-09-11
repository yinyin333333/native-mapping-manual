import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat, readdir } from 'node:fs/promises';
import path from 'node:path';
import { createPreviewServer, siteRoot } from '../scripts/serve.mjs';

const html = await readFile(path.join(siteRoot, 'index.html'), 'utf8');

test('the English manual is static and contains no personal workspace paths', () => {
  assert.match(html, /<html lang="en">/);
  assert.doesNotMatch(html, /MOD AUTHOR GUIDE|Config v1|Turn a CubeMain|troubleshooting/i);
  assert.equal([...html.matchAll(/class="chapter(?: hero)?"/g)].length, 12);
  assert.equal([...html.matchAll(/<h1\b/g)].length, 1);
  assert.equal([...html.matchAll(/<input\b|<select\b|<dialog\b|<canvas\b/g)].length, 0);
  assert.doesNotMatch(html, /[C-F]:[\\/]|Users[\\/]|eun|NativeMapping_build_|0\.9\.7/i);
});

test('every fragment target exists and IDs are unique', () => {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(ids.length, new Set(ids).size);
  for (const [, anchor] of html.matchAll(/href="#([^"]+)"/g)) assert.ok(ids.includes(anchor), `Missing #${anchor}`);
});

test('all static assets and the complete configuration download exist', async () => {
  for (const [, relative] of html.matchAll(/(?:src|href)="\.\/([^"]+)"/g)) {
    assert.ok((await stat(path.join(siteRoot, relative))).isFile(), relative);
  }
  assert.equal([...html.matchAll(/data-kind="complete"/g)].length, 1);
  assert.equal([...html.matchAll(/data-kind="excerpt"/g)].length, 7);
  assert.equal([...html.matchAll(/data-context="examples\/[^"]+"/g)].length, 7);
});

test('preview serves both root and project-subpath URLs, but not maintenance output', async () => {
  const server = createPreviewServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const prefix of ['', '/native-mapping-manual']) {
      for (const resource of ['/', '/assets/style.css', '/assets/app.js', '/examples/first-map.toml', '/guides/risk-reward.html']) {
        const response = await fetch(`${base}${prefix}${resource}`);
        assert.equal(response.status, 200, `${prefix}${resource}`);
      }
    }
    for (const resource of ['/.git/config', '/.test-output/source-verification.json', '/README.md', '/tests/native/check.cpp']) {
      assert.equal((await fetch(base + resource)).status, 404);
    }
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});


test('all worked examples have complete downloads and valid local links', async () => {
  const files = (await readdir(path.join(siteRoot, 'guides'))).filter(name => name.endsWith('.html'));
  assert.equal(files.length, 8);
  for (const file of files) {
    const filename = path.join(siteRoot, 'guides', file);
    const page = await readFile(filename, 'utf8');
    assert.match(page, /data-kind="complete"/);
    assert.doesNotMatch(page, /[C-F]:[\\/]|Users[\\/]|eun|0\.9\.[0-9]+|<input\b|<select\b/i);
    for (const [, href] of page.matchAll(/(?:href|src)="([^"]+)"/g)) {
      const [relative, fragment] = href.split('#');
      const target = relative ? path.resolve(path.dirname(filename), relative) : filename;
      assert.ok((await stat(target)).isFile(), `${file}: ${href}`);
      if (fragment) assert.ok((await readFile(target, 'utf8')).includes(`id="${fragment}"`), `${file}: ${href}`);
    }
  }
});


test('HUD snippets and CubeMain insertion rows preserve their expected shapes', async () => {
  for (const variant of ['standard', 'hd']) {
    const node = JSON.parse(await readFile(path.join(siteRoot, `examples/hud-${variant}-node.json`), 'utf8'));
    assert.equal(node.name, 'MappingInfoTextWrapper');
    assert.equal(node.children.length, 1);
    assert.equal(node.children[0].name, 'MappingInfoText');
    assert.equal(node.fields.minHeight, variant === 'hd' ? 50 : 16);
  }
  const lines = (await readFile(path.join(siteRoot, 'examples/cubemain-mapping-rows.tsv'), 'utf8')).trimEnd().split(/\r?\n/).map(line => line.split('\t'));
  const header = lines.shift();
  assert.equal(lines.length, 2);
  for (const row of lines) {
    assert.equal(row.length, header.length);
    assert.equal(row[header.indexOf('output')], 'Red Portal,lvl=2,qty=1');
    assert.equal(row[header.indexOf('op')], '');
  }
  assert.equal(lines[1][header.indexOf('numinputs')], '3');
  assert.equal(lines[1][header.indexOf('input 2')], 'r01,qty=2');
});
