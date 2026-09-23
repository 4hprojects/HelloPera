/**
 * Plain-language descriptions of the system switches in `feature_flags`.
 *
 * The table stores developer keys (`ads_enabled_global`). An administrator
 * should never have to read one: every screen that shows a switch looks its
 * name up here instead. The keys themselves stay as they are, because code
 * reads them.
 *
 * `connected` is the honest part. A switch is only "connected" if some code
 * actually reads it. `premium_enabled` is seeded but nothing consults it yet,
 * so flipping it changes nothing. The
 * admin page says so rather than offering a control that does nothing — see
 * `docs/PHASE-13-NOTES.md`. When one of them gets wired to real behaviour,
 * flip `connected` here in the same change.
 */

export type FlagGroup = 'money' | 'features' | 'safety';

export type FlagInfo = {
  /** Short name, in the words an administrator would use. */
  title: string;
  /** What changes for the people using HelloPera. */
  description: string;
  group: FlagGroup;
  /** False when no code reads this switch, so changing it has no effect. */
  connected: boolean;
  /**
   * The direction that needs extra care. `when: 'off'` means turning the
   * switch OFF is the risky move (a freeze); `when: 'on'` means turning it ON
   * is (something gets deleted).
   */
  caution?: { when: 'on' | 'off'; text: string };
};

export const FLAG_GROUP_TITLES: Record<FlagGroup, string> = {
  money: 'Money and plans',
  features: 'Features',
  safety: 'Safety and data',
};

/** Display order of the groups on the page. */
export const FLAG_GROUP_ORDER: readonly FlagGroup[] = ['money', 'features', 'safety'];

const CATALOG: Record<string, FlagInfo> = {
  ads_enabled_global: {
    title: 'Advertising',
    description:
      "Show Google ads on public pages. Ads also need an AdSense account and each visitor's consent, so turning this on alone shows nothing.",
    group: 'money',
    connected: true,
  },
  billing_enabled: {
    title: 'Paid billing',
    description:
      'Let customers pay for Premium and manage their payments. Needs a payment provider to be connected first.',
    group: 'money',
    connected: true,
  },
  premium_enabled: {
    title: 'Premium plan',
    description: 'Make the Premium plan available to buy.',
    group: 'money',
    connected: false,
  },
  ai_enabled: {
    title: 'AI assistant',
    description:
      'Show the assistant, where people ask questions about their own money. Needs an AI key to be set up first.',
    group: 'features',
    connected: true,
  },
  ocr_enabled: {
    title: 'Document reading',
    description: 'Read receipts and statements to fill in the details automatically.',
    group: 'features',
    connected: true,
  },
  push_enabled: {
    title: 'Push notifications',
    description: 'Send reminders to people’s phones and browsers.',
    group: 'features',
    connected: true,
  },
  financial_writes_enabled: {
    title: 'Allow changes to money records',
    description:
      'Normally on: people can add, edit and delete their transactions, accounts and bills. Turn off only in an emergency — everything becomes read-only for everyone.',
    group: 'safety',
    connected: true,
    caution: {
      when: 'off',
      text: 'This stops every user from adding, editing or deleting money records until you turn it back on. They can still view them.',
    },
  },
  retention_enabled: {
    title: 'Automatic data cleanup',
    description:
      'Every night, delete old notifications, the raw text read from documents, and device registrations that have stopped working. Off by default.',
    group: 'safety',
    connected: true,
    caution: {
      when: 'on',
      text: 'This permanently deletes data every night. Turn it on only after the time periods match what the privacy page promises.',
    },
  },
};

/** `some_new_flag_enabled` → `Some new flag`. Never returns an underscore. */
export function humaniseFlagKey(key: string): string {
  const words = key
    .replace(/_enabled$/, '')
    .replace(/[_-]+/g, ' ')
    .trim();
  if (!words) return 'Unnamed switch';
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * The description for a switch, whether or not it has been written up.
 *
 * A switch added later without a catalog entry still gets a readable name and
 * is shown as connected — the safe assumption, because hiding a working switch
 * is worse than showing one that has no description yet.
 */
export function flagInfo(key: string): FlagInfo {
  return (
    CATALOG[key] ?? {
      title: humaniseFlagKey(key),
      description: 'No description has been written for this switch yet.',
      group: 'features',
      connected: true,
    }
  );
}

export const KNOWN_FLAG_KEYS: readonly string[] = Object.keys(CATALOG);
