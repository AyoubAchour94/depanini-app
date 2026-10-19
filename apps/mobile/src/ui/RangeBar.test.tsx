import { render, screen } from '@testing-library/react-native';

import { RangeBar, rangeFraction } from './RangeBar';

const format = (value: number) => `${value} TND`;

const flat = (style: unknown): Record<string, unknown> =>
  Object.assign({}, ...[style].flat(Infinity).filter(Boolean));

describe('rangeFraction', () => {
  it('places a value between the ends', () => {
    expect(rangeFraction(65, 52, 195)).toBeCloseTo(13 / 143);
    expect(rangeFraction(52, 52, 195)).toBe(0);
    expect(rangeFraction(195, 52, 195)).toBe(1);
  });

  it('keeps a value outside the range on the bar', () => {
    expect(rangeFraction(10, 52, 195)).toBe(0);
    expect(rangeFraction(300, 52, 195)).toBe(1);
  });

  it('is 0 for an empty range', () => {
    expect(rangeFraction(50, 50, 50)).toBe(0);
  });
});

describe('RangeBar', () => {
  it('labels both ends and reads the value and the range aloud', async () => {
    await render(
      <RangeBar value={65} min={52} max={195} format={format} hint="Accept or counter" />,
    );

    expect(screen.getByText('52 TND')).toBeOnTheScreen();
    expect(screen.getByText('195 TND')).toBeOnTheScreen();
    expect(screen.getByText('Accept or counter')).toBeOnTheScreen();
    const bar = screen.getByRole('progressbar');
    expect(bar.props.accessibilityLabel).toBe('65 TND, between 52 TND and 195 TND');
    expect(bar.props.accessibilityValue).toEqual({ min: 52, max: 195, now: 65 });
  });

  it('puts the thumb at the fare and the tick at the suggested fare', async () => {
    await render(<RangeBar value={100} min={50} max={150} suggested={75} format={format} />);

    expect(flat(screen.getByTestId('range-thumb').props.style).start).toBe('50%');
    expect(flat(screen.getByTestId('range-suggested').props.style).start).toBe('25%');
  });

  it('has no tick without a suggested fare', async () => {
    await render(<RangeBar value={100} min={50} max={150} format={format} />);

    expect(screen.queryByTestId('range-suggested')).toBeNull();
  });
});
