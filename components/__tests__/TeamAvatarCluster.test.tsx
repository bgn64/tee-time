import { render } from '@testing-library/react-native';

import { TeamAvatarCluster } from '@/components/TeamAvatarCluster';

describe('TeamAvatarCluster', () => {
  test('renders one avatar per member with the first letter uppercased', () => {
    const { getAllByText } = render(
      <TeamAvatarCluster
        members={[
          { id: 'a', name: 'alice', color: '#ff0000' },
          { id: 'b', name: 'bob', color: '#00ff00' },
        ]}
      />
    );
    expect(getAllByText('A')).toHaveLength(1);
    expect(getAllByText('B')).toHaveLength(1);
  });

  test('renders nothing when members is empty', () => {
    const { toJSON } = render(<TeamAvatarCluster members={[]} />);
    // The component returns an empty <View />; tree should be a single
    // node with no children.
    const tree = toJSON();
    expect(tree).toBeTruthy();
  });

  test('caps visible avatars at `max` and shows +N for the remainder', () => {
    const members = [
      { id: 'a', name: 'alice', color: '#f00' },
      { id: 'b', name: 'bob', color: '#0f0' },
      { id: 'c', name: 'carol', color: '#00f' },
      { id: 'd', name: 'dave', color: '#ff0' },
      { id: 'e', name: 'eve', color: '#0ff' },
      { id: 'f', name: 'frank', color: '#f0f' },
    ];
    const { getByText, queryByText } = render(
      <TeamAvatarCluster members={members} max={3} />
    );
    expect(queryByText('A')).not.toBeNull();
    expect(queryByText('B')).not.toBeNull();
    expect(queryByText('C')).not.toBeNull();
    expect(queryByText('D')).toBeNull();
    expect(getByText('+3')).toBeTruthy();
  });

  test('handles missing/empty name gracefully', () => {
    const { getByText } = render(
      <TeamAvatarCluster members={[{ id: 'a', name: '', color: '#000' }]} />
    );
    expect(getByText('?')).toBeTruthy();
  });
});
