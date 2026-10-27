import '@testing-library/jest-dom/vitest';

import { cleanup, configure } from '@testing-library/react';
import { afterEach, beforeEach } from 'vitest';

import { i18n } from '../i18n';
import { LANGUAGE_KEY } from '../i18n/language';

// The first render of the whole app in a file is cold (module graph, jsdom, router) and takes
// about a second on an idle machine, more on a loaded CI runner. Testing Library's default
// 1000 ms for findBy*/waitFor sits right on that, so give async queries room; they still return
// as soon as the element appears, so passing tests stay fast.
configure({ asyncUtilTimeout: 8000 });

// The app defaults to French; these tests read English, so every test pins it. Tests of
// another language set it themselves (see `i18n/i18n.test.tsx`).
beforeEach(async () => {
  window.localStorage.setItem(LANGUAGE_KEY, 'en');
  await i18n.changeLanguage('en');
});

afterEach(() => cleanup());
