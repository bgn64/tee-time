/**
 * ScoreEntryRow — score-entry row used by live scoring + round-edit mode.
 *
 * Validates:
 *   · Renders one avatar per member (cluster reflects the team).
 *   · Displays the `name` when provided.
 *   · Skips the name line entirely when omitted (cluster-only / scramble path).
 *   · Calls `onChange` with `par + relative` when a quick-pick chip is pressed.
 */

import { fireEvent, render } from '@testing-library/react-native';

import { ScoreEntryRow } from '@/components/ScoreEntryRow';
import { AppThemeProvider } from '@/state/ThemeContext';

function wrap(node: React.ReactNode) {
  return <AppThemeProvider>{node}</AppThemeProvider>;
}

describe('ScoreEntryRow', () => {
  test('renders one avatar per member', () => {
    const { getByText } = render(
      wrap(
        <ScoreEntryRow
          members={[
            { id: 'a', name: 'Alice', color: '#f00' },
            { id: 'b', name: 'Bob', color: '#0f0' },
            { id: 'c', name: 'Carol', color: '#00f' },
          ]}
          holeNumber={1}
          par={4}
          strokes={null}
          onChange={() => {}}
        />
      )
    );
    expect(getByText('A')).toBeTruthy();
    expect(getByText('B')).toBeTruthy();
    expect(getByText('C')).toBeTruthy();
  });

  test('renders the name when provided (stroke path)', () => {
    const { getByText } = render(
      wrap(
        <ScoreEntryRow
          members={[{ id: 'a', name: 'Alice', color: '#f00' }]}
          name="Alice"
          holeNumber={1}
          par={4}
          strokes={null}
          onChange={() => {}}
        />
      )
    );
    expect(getByText('Alice')).toBeTruthy();
  });

  test('omits the name line when name is undefined (scramble path)', () => {
    const { queryByText } = render(
      wrap(
        <ScoreEntryRow
          members={[
            { id: 'a', name: 'Alice', color: '#f00' },
            { id: 'b', name: 'Bob', color: '#0f0' },
          ]}
          holeNumber={1}
          par={4}
          strokes={null}
          onChange={() => {}}
        />
      )
    );
    // Neither the team name nor the individual member names should appear
    // as text — only their initials inside the cluster avatars.
    expect(queryByText('Alice')).toBeNull();
    expect(queryByText('Bob')).toBeNull();
    expect(queryByText('Alice & Bob')).toBeNull();
  });

  test('calls onChange with par + relative when a quick-pick chip is pressed', () => {
    const onChange = jest.fn();
    const { getByText } = render(
      wrap(
        <ScoreEntryRow
          members={[{ id: 'a', name: 'Alice', color: '#f00' }]}
          name="Alice"
          holeNumber={1}
          par={4}
          strokes={null}
          onChange={onChange}
        />
      )
    );
    fireEvent.press(getByText('E'));
    expect(onChange).toHaveBeenCalledWith(4);
    fireEvent.press(getByText('+1'));
    expect(onChange).toHaveBeenLastCalledWith(5);
    fireEvent.press(getByText('−2'));
    expect(onChange).toHaveBeenLastCalledWith(2);
  });

  test('quick-pick floors strokes at 1 even for impossibly-low pars', () => {
    const onChange = jest.fn();
    const { getByText } = render(
      wrap(
        <ScoreEntryRow
          members={[{ id: 'a', name: 'Alice', color: '#f00' }]}
          name="Alice"
          holeNumber={1}
          par={2}
          strokes={null}
          onChange={onChange}
        />
      )
    );
    fireEvent.press(getByText('−2'));
    expect(onChange).toHaveBeenLastCalledWith(1);
  });
});
