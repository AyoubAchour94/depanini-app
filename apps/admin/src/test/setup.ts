import '@testing-library/jest-dom/vitest';

import { cleanup, configure } from '@testing-library/react';
import { afterEach } from 'vitest';

// The first render of the whole app in a file is cold (module graph, jsdom, router) and takes
// about a second on an idle machine, more on a loaded CI runner. Testing Library's default
// 1000 ms for findBy*/waitFor sits right on that, so give async queries room; they still return
// as soon as the element appears, so passing tests stay fast.
configure({ asyncUtilTimeout: 8000 });

afterEach(() => cleanup());
