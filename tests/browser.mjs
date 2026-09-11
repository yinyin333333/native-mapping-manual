/** Document rendering checks in an isolated Chromium profile. */
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { createPreviewServer, siteRoot } from '../scripts/serve.mjs';

const output = path.join(siteRoot, '.test-output');
await mkdir(output, { recursive: true });
const browserPath = [process.env.BROWSER_PATH,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find(candidate => candidate && existsSync(candidate));
if (!browserPath) throw new Error('Set BROWSER_PATH to an installed Chromium browser.');

class CDP {
  constructor(socket) {
    this.socket = socket;
    this.id = 0;
    this.pending = new Map();
    this.listeners = new Map();
    socket.addEventListener('message', event => {
      const reply = JSON.parse(String(event.data));
      if (reply.id) {
        const pending = this.pending.get(reply.id);
        if (!pending) return;
        clearTimeout(pending.timer);
        this.pending.delete(reply.id);
        if (reply.error) pending.reject(new Error(JSON.stringify(reply.error)));
        else pending.resolve(reply.result);
      } else {
        for (const listener of this.listeners.get(reply.method) || []) listener(reply.params);
      }
    });
    socket.addEventListener('close', () => {
      for (const pending of this.pending.values()) {
        clearTimeout(pending.timer);
        pending.reject(new Error('Browser connection closed'));
      }
      this.pending.clear();
    });
  }
  static async connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', reject, { once: true });
    });
    return new CDP(socket);
  }
  on(method, listener) {
    if (!this.listeners.has(method)) this.listeners.set(method, []);
    this.listeners.get(method).push(listener);
  }
  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.id;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Browser command timeout: ${method}`));
      }, 12000);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async evaluate(expression) {
    const reply = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true });
    if (reply.exceptionDetails) throw new Error(reply.exceptionDetails.exception?.description || reply.exceptionDetails.text);
    return reply.result.value;
  }
  close() { this.socket.close(); }
}

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate, message) {
  const start = Date.now();
  while (Date.now() - start < 12000) {
    if (await predicate()) return;
    await delay(60);
  }
  throw new Error(`Timed out: ${message}`);
}
const server = createPreviewServer();
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const url = `${origin}/native-mapping-manual/`;
const profile = await mkdtemp(path.join(output, 'browser-profile-'));
const browser = spawn(browserPath, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
let browserLog = '', cdp, browserCdp;
browser.stderr.on('data', data => { browserLog = (browserLog + data).slice(-16000); });
browser.on('error', error => { browserLog += error.message; });
const results = [], errors = [];
async function check(name, action) {
  await action();
  results.push({ name, passed: true });
  console.log(`PASS ${name}`);
}

try {
  const portFile = path.join(profile, 'DevToolsActivePort');
  await until(() => existsSync(portFile), 'isolated browser startup');
  const [port, endpoint] = (await readFile(portFile, 'utf8')).trim().split(/\r?\n/);
  browserCdp = await CDP.connect(`ws://127.0.0.1:${port}${endpoint}`);
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  cdp = await CDP.connect(target.webSocketDebuggerUrl);
  let loads = 0;
  cdp.on('Page.loadEventFired', () => { loads++; });
  cdp.on('Runtime.exceptionThrown', details => errors.push(details.exceptionDetails.exception?.description || details.exceptionDetails.text));
  cdp.on('Runtime.consoleAPICalled', details => { if (details.type === 'error') errors.push(JSON.stringify(details.args)); });
  await Promise.all([cdp.send('Page.enable'), cdp.send('Runtime.enable')]);
  await cdp.send('Page.bringToFront');
  await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  const evaluate = expression => cdp.evaluate(expression);
  const settled = () => evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  const navigate = async (location, scriptsEnabled = true) => {
    const before = loads;
    const navigation = await cdp.send('Page.navigate', { url: location });
    // Fragment-only changes do not emit a load event. Reload to exercise a
    // genuinely direct entry into the document, rather than wait for one.
    if (!navigation.loaderId) await cdp.send('Page.reload');
    await until(() => loads > before, 'page load');
    if (scriptsEnabled) await settled();
    else await delay(80);
  };
  const viewport = (width, height) => cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 });
  const go = async id => {
    await evaluate(`location.hash = ${JSON.stringify(id)}`);
    await delay(90);
    await settled();
  };
  const screenshot = async name => {
    await settled();
    const image = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    await writeFile(path.join(output, `${name}.png`), Buffer.from(image.data, 'base64'));
  };
  await viewport(1440, 1050);
  await navigate(url);

  await check('all thirteen chapters are present in one readable document', async () => {
    assert.equal(await evaluate('document.querySelectorAll("main > section.chapter").length'), 13);
    assert.equal(await evaluate('document.querySelectorAll("nav").length'), 1);

    assert.equal(await evaluate('[...document.querySelectorAll("main > section")].every(node => node.getBoundingClientRect().height > 0)'), true);
    assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
  });
  await screenshot('desktop-overview');
  await check('native section links scroll to their visible heading', async () => {
    for (const id of ['installation', 'first-map', 'effects', 'reference', 'overview']) {
      await go(id);
      const bounds = await evaluate(`(() => { const box = document.getElementById(${JSON.stringify(id)}).getBoundingClientRect(); return { top: box.top, bottom: box.bottom, header: document.querySelector('header').getBoundingClientRect().bottom }; })()`);
      assert.ok(bounds.bottom > 0);
      assert.ok(bounds.top >= bounds.header - 2, `Covered anchor: ${id}`);
    }
  });
  await check('highlighted configuration and clipboard retain the exact complete file', async () => {
    const expected = (await readFile(path.join(siteRoot, 'examples/first-map.toml'), 'utf8')).trim();
    assert.equal(await evaluate('document.querySelector("#first-map-code").textContent.trim()'), expected);
    assert.ok(await evaluate('document.querySelectorAll("#first-map-code .token-table").length') >= 2);
    await go('first-config');
    await cdp.send('Page.bringToFront');
    await browserCdp.send('Browser.grantPermissions', { origin, permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] });
    await evaluate('document.querySelector("#first-config [data-copy]").click()');
    await until(() => evaluate('document.querySelector("#copy-status").textContent === "Copied."'), 'copy feedback');
    const copied = await evaluate('navigator.clipboard.readText()');
    assert.equal(copied.replace(/\r\n/g, '\n').trim(), expected.replace(/\r\n/g, '\n'));
  });
  await until(() => evaluate('document.querySelector("#copy-status").textContent === ""'), 'copy feedback clears');
  await screenshot('desktop-first-configuration');
  await check('developer build and reference disclosures work through keyboard and anchors', async () => {
    await go('build-from-source');
    assert.equal(await evaluate('document.querySelector("#build-from-source").open'), true);
    await evaluate('document.querySelector("#build-from-source summary").focus()');
    assert.equal(await evaluate('document.activeElement === document.querySelector("#build-from-source summary")'), true);
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', text: '\r', unmodifiedText: '\r', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
    await settled();
    assert.equal(await evaluate('document.querySelector("#build-from-source").open'), false);

  });
  await go('treasure-classes');
  await screenshot('desktop-treasure-classes');

  await check('mobile layouts keep every section inside the viewport', async () => {
    for (const width of [390, 320]) {
      await viewport(width, 844);
      for (const id of ['overview', 'installation', 'first-map', 'first-config', 'recipes', 'effects', 'treasure-classes', 'reference']) {
        await go(id);
        assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, `${id} at ${width}px`);
      }
      await go('overview');
      assert.ok(await evaluate('document.querySelector("h1").getBoundingClientRect().height') < 170);
    }
  });
  await viewport(390, 844);
  await go('overview');
  await screenshot('mobile-overview');
  await go('first-config');
  await screenshot('mobile-first-configuration');
  await check('direct fragment loads reveal folded content', async () => {
    await navigate(`${url}?direct-entry=1#build-commands`);
    const state = await evaluate('({ url: location.href, ready: document.readyState, open: document.querySelector("#build-from-source").open, highlighted: document.querySelectorAll(".token-key").length })');
    assert.equal(state.open, true, JSON.stringify(state));
  });
  await check('the full manual and download remain available without JavaScript', async () => {
    await cdp.send('Emulation.setScriptExecutionDisabled', { value: true });
    await navigate(url, false);
    assert.equal(await evaluate('document.querySelectorAll("main > section.chapter").length'), 13);
    assert.ok(await evaluate('document.querySelectorAll("a[download]").length') >= 6);
    assert.ok(await evaluate('document.querySelector("#first-map-code").textContent.includes("[cube_routes.scroll_map]")'));
    await cdp.send('Emulation.setScriptExecutionDisabled', { value: false });
  });
  await check('worked examples load with readable code and no horizontal page overflow', async () => {
    for (const name of ['risk-reward', 'aura-contract', 'endgame-loop']) {
      for (const width of [1440, 390, 320]) {
        await viewport(width, 1000);
        await navigate(`${url}guides/${name}.html`);
        assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, `${name}: ${width}`);
        assert.ok(await evaluate('document.querySelector("#task-config").textContent.length') > 100);
        assert.equal(await evaluate('document.querySelectorAll(".contents [aria-current=page]").length'), 1);
      }
    }
    await viewport(1440, 1050);
    await navigate(`${url}guides/risk-reward.html`);
    await screenshot('desktop-worked-example');
    await viewport(390, 844);
    await navigate(`${url}guides/aura-contract.html`);
    await screenshot('mobile-worked-example');
    await viewport(1440, 1050);
    await navigate(url);
    await go('structure');
    await screenshot('desktop-plugin-structure');
  });
  await check('no page errors or third-party assets were loaded', async () => {
    assert.deepEqual(errors, []);
    const resources = await evaluate('performance.getEntriesByType("resource").map(entry => entry.name)');
    assert.ok(resources.every(resource => resource.startsWith(origin)));
  });
  console.log(`\n${results.length} document browser checks passed.`);
} catch (error) {
  results.push({ name: 'Browser run', passed: false, detail: error.stack });
  console.error(error.stack);
  process.exitCode = 1;
  if (cdp) {
    try {
      const image = await cdp.send('Page.captureScreenshot', { format: 'png' });
      await writeFile(path.join(output, 'failure.png'), Buffer.from(image.data, 'base64'));
    } catch { /* No screenshot is available when startup fails. */ }
  }
} finally {
  await writeFile(path.join(output, 'browser-results.json'), JSON.stringify({ results, errors }, null, 2) + '\n');
  await writeFile(path.join(output, 'browser-stderr.log'), browserLog);
  try { await browserCdp?.send('Browser.close'); } catch { /* Browser may close before replying. */ }
  cdp?.close(); browserCdp?.close();
  if (browser.exitCode === null) browser.kill();
  await new Promise(resolve => server.close(resolve));
}
