import { render, screen } from '@testing-library/react-native';

import { NavBanner } from './NavBanner';
import { driverStrings as t } from './strings';

describe('NavBanner', () => {
  it('leads with the distance once it is known', async () => {
    await render(
      <NavBanner
        title="Pickup"
        target={t.navTarget.en_route}
        address="Avenue Bourguiba"
        distance={t.navDistance(1234)}
      />,
    );
    expect(screen.getByText('1.2 km')).toBeOnTheScreen();
    expect(screen.getByText('to pickup · Avenue Bourguiba')).toBeOnTheScreen();
  });

  it('leads with the stop when the truck location is not known', async () => {
    await render(<NavBanner title="Drop-off" target={t.navTarget.towing} address="La Marsa" />);
    expect(screen.getByText('Drop-off')).toBeOnTheScreen();
    expect(screen.getByText('to drop-off · La Marsa')).toBeOnTheScreen();
  });

  it('rounds short distances to ten metres', () => {
    expect(t.navDistance(347)).toBe('350 m');
    expect(t.navDistance(999)).toBe('1.0 km');
    expect(t.navDistance(1000)).toBe('1.0 km');
  });
});
