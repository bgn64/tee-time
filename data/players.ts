/**
 * Seed player data for the prototype.
 */

import { Player } from '@/types/golf';

export const defaultPlayers: Player[] = [
  { id: 'user', name: 'You', isUser: true, color: '#7cb342' },
  { id: 'mike', name: 'Mike', isUser: false, color: '#42a5f5' },
  { id: 'sarah', name: 'Sarah', isUser: false, color: '#ab47bc' },
  { id: 'dave', name: 'Dave', isUser: false, color: '#ff8f00' },
];
