import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Text as RNText } from 'react-native';

import { i18n } from '@/i18n';
import { buildTheme } from '@/theme/tokens';

import { Avatar, initialsOf } from './Avatar';
import { Button } from './Button';
import { Chip } from './Chip';
import { ChoiceField } from './ChoiceField';
import { Divider } from './Divider';
import { FareStepper } from './FareStepper';
import { Num } from './Num';
import { Pill } from './Pill';
import { RoundButton } from './RoundButton';
import { Sheet } from './Sheet';
import { StageBar } from './StageBar';
import { Text } from './Text';
import { TextField } from './TextField';

let mockScheme: 'light' | 'dark' = 'light';
jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: () => mockScheme,
}));

const flat = (style: unknown): Record<string, unknown> =>
  Object.assign({}, ...[style].flat(Infinity).filter(Boolean));

beforeEach(() => {
  mockScheme = 'light';
});

describe('Text', () => {
  it('applies the type step and tone from the theme', async () => {
    await render(
      <Text variant="title" tone="muted">
        Hello
      </Text>,
    );
    const style = flat(screen.getByText('Hello').props.style);
    expect(style).toMatchObject({ fontFamily: 'Inter_700Bold', fontSize: 24 });
    expect(style.color).toBe(buildTheme('light', 'user').color.muted);
  });
});

describe('Num', () => {
  it('uses tabular figures and reads as one text with its unit', async () => {
    await render(<Num value="85" unit="TND" size="display" />);
    const text = screen.getByText('85 TND');
    expect(flat(text.props.style).fontVariant).toEqual(['tabular-nums']);
  });

  it('reads figure then unit from the right in Arabic', async () => {
    await act(() => i18n.changeLanguage('ar'));
    try {
      await render(<Num value="85" unit="TND" size="display" />);
      expect(screen.getByText('‏85 TND')).toBeOnTheScreen();
    } finally {
      await act(() => i18n.changeLanguage('en'));
    }
  });
});

describe('Button', () => {
  it('presses, and does nothing while disabled or loading', async () => {
    const onPress = jest.fn();
    await render(
      <>
        <Button title="Go" onPress={onPress} />
        <Button title="Off" onPress={onPress} disabled />
        <Button title="Busy" onPress={onPress} loading />
      </>,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Go' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Off' }));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Off' })).toBeDisabled();
  });

  it('fills primary with the brand, secondary with a neutral fill and danger with danger', async () => {
    await render(
      <>
        <Button title="P" onPress={jest.fn()} />
        <Button title="S" kind="secondary" onPress={jest.fn()} />
        <Button title="D" kind="danger" onPress={jest.fn()} />
      </>,
    );
    const { color } = buildTheme('light', 'user');
    const bg = (name: string) =>
      flat(screen.getByRole('button', { name }).props.style).backgroundColor;
    expect(bg('P')).toBe(color.brand);
    expect(bg('S')).toBe(color.surface2);
    expect(bg('D')).toBe(color.danger);
  });

  it('is 56px by default, 44px small and 64px big', async () => {
    await render(
      <>
        <Button title="M" onPress={jest.fn()} />
        <Button title="S" size="sm" onPress={jest.fn()} />
        <Button title="B" size="big" onPress={jest.fn()} />
      </>,
    );
    const height = (name: string) => flat(screen.getByRole('button', { name }).props.style).height;
    expect([height('M'), height('S'), height('B')]).toEqual([56, 44, 64]);
  });

  it('follows the dark scheme', async () => {
    mockScheme = 'dark';
    await render(<Button title="P" onPress={jest.fn()} />);
    const bg = flat(screen.getByRole('button', { name: 'P' }).props.style).backgroundColor;
    expect(bg).toBe(buildTheme('dark', 'user').color.brand);
  });
});

describe('TextField', () => {
  it('labels the input and shows an error', async () => {
    await render(<TextField label="Phone" error="Too short" />);
    expect(screen.getByLabelText('Phone')).toBeOnTheScreen();
    expect(screen.getByText('Too short')).toBeOnTheScreen();
  });
});

describe('ChoiceField', () => {
  it('marks the selected option and reports a change', async () => {
    const onChange = jest.fn();
    await render(
      <ChoiceField
        label="Vehicle"
        options={[
          { value: 'car', label: 'Car' },
          { value: 'van', label: 'Van' },
        ]}
        value="car"
        onChange={onChange}
      />,
    );
    expect(screen.getByRole('radio', { name: 'Car' })).toBeChecked();
    await fireEvent.press(screen.getByRole('radio', { name: 'Van' }));
    expect(onChange).toHaveBeenCalledWith('van');
  });
});

describe('FareStepper', () => {
  it('steps by one and stays within its range', async () => {
    const onChange = jest.fn();
    await render(<FareStepper fare={20} min={20} max={300} onChange={onChange} />);
    expect(screen.getByRole('button', { name: /decrease/i })).toBeDisabled();
    await fireEvent.press(screen.getByRole('button', { name: /increase/i }));
    expect(onChange).toHaveBeenCalledWith(21);
  });
});

describe('Chip', () => {
  it('toggles and exposes its selected state', async () => {
    const onPress = jest.fn();
    await render(<Chip label="Breakdown" selected onPress={onPress} />);
    expect(screen.getByRole('button', { name: 'Breakdown' })).toBeSelected();
    await fireEvent.press(screen.getByRole('button', { name: 'Breakdown' }));
    expect(onPress).toHaveBeenCalled();
  });

  it('has no role when it only states something', async () => {
    await render(<Chip label="Cash" role="none" />);
    expect(screen.queryByRole('button', { name: 'Cash' })).toBeNull();
    expect(screen.getByText('Cash')).toBeOnTheScreen();
  });

  it('can be a radio of an exclusive set', async () => {
    await render(<Chip label="Van" role="radio" selected />);
    expect(screen.getByRole('radio', { name: 'Van' })).toBeChecked();
  });
});

describe('Avatar', () => {
  it('shows initials and keeps the same colour for a name', async () => {
    expect(initialsOf('Sami Ben Ali')).toBe('SA');
    expect(initialsOf('nizar')).toBe('N');
    expect(initialsOf('  ')).toBe('?');
    await render(
      <>
        <Avatar name="Sami B." />
        <Avatar name="Sami B." />
      </>,
    );
    expect(screen.getAllByText('SB')).toHaveLength(2);
    const [a, b] = screen.getAllByLabelText('Sami B.');
    expect(flat(a?.props.style).backgroundColor).toBe(flat(b?.props.style).backgroundColor);
  });
});

describe('Pill', () => {
  it('renders the floating pill and the tinted tag', async () => {
    await render(
      <>
        <Pill label="Live" dot />
        <Pill label="Your fare" tone="success" />
      </>,
    );
    expect(screen.getByText('Live')).toBeOnTheScreen();
    expect(screen.getByText('Your fare')).toBeOnTheScreen();
  });
});

describe('RoundButton', () => {
  it('is named by its label and presses', async () => {
    const onPress = jest.fn();
    await render(
      <RoundButton accessibilityLabel="Locate me" onPress={onPress}>
        <RNText>◎</RNText>
      </RoundButton>,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Locate me' }));
    expect(onPress).toHaveBeenCalled();
  });
});

describe('StageBar', () => {
  it('names the current stage and fills the earlier ones', async () => {
    await render(<StageBar stages={['Heading', 'Arrived', 'Done']} current={1} progress={0.5} />);
    const bar = screen.getByRole('progressbar', { name: 'Arrived' });
    expect(bar.props.accessibilityValue).toMatchObject({ now: 1, max: 3 });
    expect(screen.getByText('Heading')).toBeOnTheScreen();
    expect(screen.getByText('Done')).toBeOnTheScreen();
  });

  it('shows a caption under each label when given', async () => {
    await render(
      <StageBar stages={['Heading', 'Arrived']} current={0} captions={['10:04', '–']} />,
    );
    expect(screen.getByText('10:04')).toBeOnTheScreen();
    expect(screen.getByText('–')).toBeOnTheScreen();
  });
});

describe('Sheet and Divider', () => {
  it('draws the sheet on the surface colour with rounded top corners', async () => {
    await render(
      <Sheet testID="sheet">
        <Text>Inside</Text>
      </Sheet>,
    );
    const style = flat(screen.getByTestId('sheet').props.style);
    expect(style.backgroundColor).toBe(buildTheme('light', 'user').color.surface);
    expect(style.borderTopLeftRadius).toBe(28);
    expect(screen.getByText('Inside')).toBeOnTheScreen();
  });

  it('renders a hairline', async () => {
    await render(<Divider />);
    expect(screen.toJSON()).not.toBeNull();
  });
});
