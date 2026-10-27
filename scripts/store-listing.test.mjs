import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

// Store text limits for docs/store/listings.json (Apple: name 30, subtitle 30, keywords 100;
// Google Play: title 30, short description 80, full description 4000).
const data = JSON.parse(fs.readFileSync(new URL('../docs/store/listings.json', import.meta.url)));
const len = (s) => [...s].length;

for (const [app, { locales }] of Object.entries(data.apps)) {
  test(`${app}: French, Arabic and English are all present`, () => {
    assert.deepEqual(Object.keys(locales).sort(), ['ar', 'en', 'fr']);
  });
  for (const [locale, copy] of Object.entries(locales)) {
    test(`${app}/${locale} fits the store limits`, () => {
      for (const field of Object.keys(data.limits)) {
        assert.ok(copy[field], `${field} is missing`);
        assert.ok(
          len(copy[field]) <= data.limits[field],
          `${field} is ${len(copy[field])} chars, limit ${data.limits[field]}`,
        );
      }
    });
  }
}
