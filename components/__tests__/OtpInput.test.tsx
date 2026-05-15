/**
 * OtpInput — 6-cell OTP input component.
 *
 * Validates:
 *   · Renders 6 empty cells by default.
 *   · Typing via the hidden TextInput populates cells left-to-right.
 *   · Non-digit characters are filtered.
 *   · `onSubmit` fires exactly once when the value reaches 6 digits.
 *   · Pre-filled `value` renders into the correct cells.
 */

import { fireEvent, render, screen } from '@testing-library/react-native';
import { useState } from 'react';

import { OtpInput } from '@/components/OtpInput';
import { AppThemeProvider } from '@/state/ThemeContext';

function Harness({
  initial = '',
  onSubmit,
}: {
  initial?: string;
  onSubmit?: () => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <AppThemeProvider>
      <OtpInput value={value} onChange={setValue} onSubmit={onSubmit} />
    </AppThemeProvider>
  );
}

function cellText(i: number) {
  return screen.getByTestId(`otp-cell-text-${i}`).props.children ?? '';
}

describe('OtpInput', () => {
  test('renders 6 empty cells initially', () => {
    render(<Harness />);
    for (let i = 0; i < 6; i++) {
      expect(screen.getByTestId(`otp-cell-${i}`)).toBeTruthy();
      expect(cellText(i)).toBe('');
    }
  });

  test('typing "1" populates the first cell', () => {
    render(<Harness />);
    fireEvent.changeText(screen.getByTestId('otp-input'), '1');
    expect(cellText(0)).toBe('1');
    for (let i = 1; i < 6; i++) {
      expect(cellText(i)).toBe('');
    }
  });

  test('typing "123456" populates all 6 cells', () => {
    render(<Harness />);
    fireEvent.changeText(screen.getByTestId('otp-input'), '123456');
    const expected = ['1', '2', '3', '4', '5', '6'];
    for (let i = 0; i < 6; i++) {
      expect(cellText(i)).toBe(expected[i]);
    }
  });

  test('non-digit input is filtered to digits only', () => {
    render(<Harness />);
    fireEvent.changeText(screen.getByTestId('otp-input'), '12a3');
    expect(cellText(0)).toBe('1');
    expect(cellText(1)).toBe('2');
    expect(cellText(2)).toBe('3');
    expect(cellText(3)).toBe('');
    expect(cellText(4)).toBe('');
    expect(cellText(5)).toBe('');
  });

  test('onSubmit is called when 6 digits are entered', () => {
    const onSubmit = jest.fn();
    render(<Harness onSubmit={onSubmit} />);
    fireEvent.changeText(screen.getByTestId('otp-input'), '123456');
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  test('onSubmit does not fire when only 5 digits are entered', () => {
    const onSubmit = jest.fn();
    render(<Harness onSubmit={onSubmit} />);
    fireEvent.changeText(screen.getByTestId('otp-input'), '12345');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  test('already-filled values render into the correct cells', () => {
    render(<Harness initial="42" />);
    expect(cellText(0)).toBe('4');
    expect(cellText(1)).toBe('2');
    for (let i = 2; i < 6; i++) {
      expect(cellText(i)).toBe('');
    }
  });
});
