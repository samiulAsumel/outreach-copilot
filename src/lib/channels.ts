import type { Channel } from '../types';

// Single source of truth for channel display names — DraftPanel's selector
// and LeadTimeline's history rows must never drift out of sync with each
// other on what a channel is called.
export const CHANNEL_LABEL: Record<Channel, string> = {
  email: 'Email',
  linkedin_dm: 'LinkedIn DM',
  linkedin_connection: 'LinkedIn connection note',
  whatsapp: 'WhatsApp',
  cover_letter: 'Cover letter',
};
