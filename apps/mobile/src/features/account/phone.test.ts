import { formatPhone } from './phone';

describe('formatPhone', () => {
  it('groups a Tunisian number', () => {
    expect(formatPhone('+21622333444')).toBe('+216 22 333 444');
    expect(formatPhone('+216 22 333 444')).toBe('+216 22 333 444');
  });

  it('leaves any other number as saved', () => {
    expect(formatPhone('+33612345678')).toBe('+33612345678');
    expect(formatPhone('22333444')).toBe('22333444');
  });
});
