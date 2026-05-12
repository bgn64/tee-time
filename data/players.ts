/**
 * Seed player data for the prototype.
 *
 * Only the placeholder current-user entry ships by default. Friends come
 * from the cloud roster after sign-in; ad-hoc local players are created
 * inline during round setup.
 */

import { Player } from '@/types/golf';

export const defaultPlayers: Player[] = [
  { id: 'user', nickname: 'You', color: '#7cb342' },
];
