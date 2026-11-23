const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadShell(html, url) {
  const location = new URL(url);
  const base = { href: new URL('/', location).href };
  let redirect;
  location.replace = next => { redirect = next; };
  const bootstrap = html.match(/<base href="\/"\s*\/>\s*<script>([\s\S]*?)<\/script>/);
  assert.ok(bootstrap, 'The base must be initialized before loading assets');
  vm.runInNewContext(bootstrap[1], { location, document: { querySelector: () => base } });
  return { base: new URL(base.href, location), redirect };
}

test('all entry points, including nested fallback routes, load assets from their deployment root', async () => {
  const { root, shells } = await import('../build.mjs');
  const deployments = [
    ['https://www.differkindly.com', '/'],
    ['https://anthonyminindu-cmd.github.io', '/counter-argument-v2/']
  ];
  for (const file of shells) {
    const html = fs.readFileSync(path.join(root, file), 'utf8');
    const route = file === '404.html' ? 'nested/unknown/route' : file.replace(/index\.html$/, '');
    for (const [host, prefix] of deployments) {
      const { base, redirect } = loadShell(html, host + prefix + route);
      assert.equal(redirect, undefined);
      assert.equal(base.href, host + prefix);
      const resources = [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css|svg|ico)(?:\?[^"]*)?)"/g)];
      assert.equal(resources.length, 4);
      for (const [, resource] of resources) {
        const url = new URL(resource, base);
        assert.ok(url.pathname.startsWith(prefix));
        assert.ok(fs.existsSync(path.join(root, url.pathname.slice(prefix.length))), url.href);
      }
    }
  }
});

test('legacy custom-domain links retain the query and fragment on the canonical route', async () => {
  const { root } = await import('../build.mjs');
  const html = fs.readFileSync(path.join(root, '404.html'), 'utf8');
  const host = 'https://www.differkindly.com';
  for (const suffix of ['', '/', '/home/?join=1#invite=example', '/reset-password/#sample', '//elsewhere.test/']) {
    const { redirect } = loadShell(html, host + '/counter-argument-v2' + suffix);
    assert.equal(redirect, host + '/' + suffix.replace(/^\/+/, ''));
  }
});
