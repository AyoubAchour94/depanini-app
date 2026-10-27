import { act, render, screen } from '@testing-library/react-native';

import { i18n } from '@/i18n';

import { DirectionalGlyph } from './DirectionalGlyph';

const transform = () => {
  const style = [screen.getByText('›').props.style].flat(Infinity);
  return style.find((part) => part && 'transform' in part)?.transform;
};

describe('DirectionalGlyph', () => {
  afterEach(async () => {
    await act(() => i18n.changeLanguage('en'));
  });

  it('points as drawn in a left-to-right language', async () => {
    await render(<DirectionalGlyph>›</DirectionalGlyph>);
    expect(transform()).toBeUndefined();
  });

  it('is mirrored in Arabic', async () => {
    await act(() => i18n.changeLanguage('ar'));
    await render(<DirectionalGlyph>›</DirectionalGlyph>);
    expect(transform()).toEqual([{ scaleX: -1 }]);
  });
});
