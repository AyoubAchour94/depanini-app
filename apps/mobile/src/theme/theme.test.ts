import { VARIANTS } from '@/variant/variants';

import { contrastingTextColor } from './theme';

describe('contrastingTextColor', () => {
  it('uses white text on the user blue and dark text on the driver amber', () => {
    expect(contrastingTextColor(VARIANTS.user.brandColor)).toBe('#FFFFFF');
    expect(contrastingTextColor(VARIANTS.driver.brandColor)).toBe('#101828');
  });
});
