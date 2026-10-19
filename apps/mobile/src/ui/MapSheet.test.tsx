import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ComponentProps } from 'react';
import { Text } from 'react-native';

import { MapSheet } from './MapSheet';

function layout(testID: string, height: number) {
  fireEvent(screen.getByTestId(testID), 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width: 390, height } },
  });
}

async function renderSheet(props: Partial<ComponentProps<typeof MapSheet>> = {}) {
  await render(
    <MapSheet footer={<Text>Next</Text>} {...props}>
      <Text>Content</Text>
    </MapSheet>,
  );
  await act(async () => {
    layout('map-sheet', 844);
    layout('map-sheet-footer', 80);
  });
}

async function step(actionName: 'increment' | 'decrement') {
  await act(async () => {
    fireEvent(screen.getByTestId('map-sheet-grabber'), 'accessibilityAction', {
      nativeEvent: { actionName },
    });
  });
}

describe('MapSheet', () => {
  it('shows the content and keeps the footer in the sheet', async () => {
    await renderSheet();

    expect(screen.getByText('Content')).toBeOnTheScreen();
    expect(screen.getByText('Next')).toBeOnTheScreen();
  });

  it('scrolls its content only at the highest snap point', async () => {
    await renderSheet();
    const content = () => screen.getByTestId('map-sheet-content');

    expect(content().props.scrollEnabled).toBe(false);
    await step('increment');
    expect(content().props.scrollEnabled).toBe(false);
    await step('increment');
    expect(content().props.scrollEnabled).toBe(true);
  });

  it('reports snap changes and stops at the ends', async () => {
    const onIndexChange = jest.fn();
    await renderSheet({ onIndexChange, snapPoints: ['peek', 'full'] });

    await step('decrement');
    expect(onIndexChange).not.toHaveBeenCalled();
    await step('increment');
    expect(onIndexChange).toHaveBeenCalledWith(1);
  });

  it('follows the controlled index', async () => {
    await renderSheet({ index: 2 });

    expect(screen.getByTestId('map-sheet-content').props.scrollEnabled).toBe(true);
    expect(screen.getByTestId('map-sheet-grabber').props.accessibilityValue).toEqual({
      now: 3,
      min: 1,
      max: 3,
    });
  });
});
