import { render, screen } from '@testing-library/react-native';

import { StatusBadge } from './RequestSummary';

describe('StatusBadge', () => {
  it.each([
    ['open', 'Open'],
    ['assigned', 'Assigned'],
    ['cancelled', 'Cancelled'],
    ['expired', 'Expired'],
  ] as const)('labels %s as %s', async (status, label) => {
    await render(<StatusBadge status={status} />);
    expect(screen.getByText(label)).toBeTruthy();
  });
});
