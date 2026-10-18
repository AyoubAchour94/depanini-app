import { fireEvent, render, screen } from '@testing-library/react-native';

import { DetailsStep } from './DetailsStep';

describe('DetailsStep', () => {
  it('asks for the vehicle and the problem before going on', async () => {
    const onConfirm = jest.fn();
    await render(<DetailsStep onConfirm={onConfirm} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Next' }));

    expect(screen.getByText('Choose your vehicle type')).toBeOnTheScreen();
    expect(screen.getByText('Choose the problem')).toBeOnTheScreen();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('confirms the choices with a trimmed note', async () => {
    const onConfirm = jest.fn();
    await render(<DetailsStep onConfirm={onConfirm} />);

    await fireEvent.press(screen.getByRole('radio', { name: 'SUV / van' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Flat tire' }));
    await fireEvent.changeText(
      screen.getByLabelText('Note for the driver (optional)'),
      '  rear left  ',
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Next' }));

    expect(onConfirm).toHaveBeenCalledWith({
      vehicleType: 'suv_van',
      problemType: 'flat_tire',
      note: 'rear left',
    });
  });

  it('counts the note and stops at 280 characters', async () => {
    await render(<DetailsStep onConfirm={jest.fn()} />);
    const note = screen.getByLabelText('Note for the driver (optional)');

    await fireEvent.changeText(note, 'abc');
    expect(screen.getByText('3/280')).toBeOnTheScreen();
    expect(note.props.maxLength).toBe(280);
  });

  it('keeps what was entered before', async () => {
    const onConfirm = jest.fn();
    await render(
      <DetailsStep
        initial={{ vehicleType: 'motorcycle', problemType: 'battery', note: 'dead' }}
        onConfirm={onConfirm}
      />,
    );

    await fireEvent.press(screen.getByRole('button', { name: 'Next' }));
    expect(onConfirm).toHaveBeenCalledWith({
      vehicleType: 'motorcycle',
      problemType: 'battery',
      note: 'dead',
    });
  });
});
