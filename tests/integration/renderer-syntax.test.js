/**
 * Renderer syntax check.
 *
 * The entire UI is one 5000-line inline <script> in src/index.html, which no
 * other test loads: a stray bracket there passes the whole suite and only
 * shows up as a blank window at startup. Parsing it here closes that gap.
 *
 * Parse only — the script is never executed. It expects a DOM this test has
 * no business providing.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '../..');

// Control characters, minus tab (\x09), newline (\x0A) and CR (\x0D).
const CONTROL_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/;

/** Inline <script> bodies, with the line each one starts on. */
function inlineScripts(html) {
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  const out = [];
  let m;
  while ((m = re.exec(html)) !== null) {
    out.push({ body: m[1], line: html.slice(0, m.index).split('\n').length });
  }
  return out;
}

describe('Renderer syntax', () => {
  const html = fs.readFileSync(path.join(ROOT, 'src/index.html'), 'utf8');
  const scripts = inlineScripts(html);

  it('finds the inline script at all', () => {
    // Without this, a markup change that hid the script would make the parse
    // test below pass by having nothing to parse.
    expect(scripts.length).toBeGreaterThan(0);
    expect(scripts.reduce((n, s) => n + s.body.split('\n').length, 0)).toBeGreaterThan(1000);
  });

  it('parses every inline script in src/index.html', () => {
    for (const s of scripts) {
      expect(
        () => new vm.Script(s.body, { filename: `index.html:${s.line}` }),
        `syntax error in the inline script starting at index.html:${s.line}`
      ).not.toThrow();
    }
  });

  it('parses main.js and preload.js', () => {
    // Neither can be required here — they pull in electron — but both parse.
    for (const f of ['main.js', 'preload.js']) {
      const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
      expect(() => new vm.Script(src, { filename: f }), `syntax error in ${f}`).not.toThrow();
    }
  });

  it('has no raw control characters in the renderer source', () => {
    // A literal NUL or ESC in the source is invisible in an editor, survives
    // review, and turns grep output into "binary file matches".
    const offenders = [];
    html.split('\n').forEach((line, i) => {
      // eslint-disable-next-line no-control-regex
      if (CONTROL_CHARS.test(line)) offenders.push(i + 1);
    });
    expect(offenders).toEqual([]);
  });
});
