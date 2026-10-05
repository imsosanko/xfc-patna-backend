const PERMISSIONS = {
  // ═══ Activities ═══
  ACTIVITIES_VIEW: 'activities.view',
  ACTIVITIES_MANAGE: 'activities.manage',

  // ═══ Members ═══
  MEMBERS_VIEW: 'members.view',
  MEMBERS_MANAGE: 'members.manage',
  MEMBERS_EDIT: 'members.edit',

  // ═══ Leaderboard ═══
  LEADERBOARD_VIEW: 'leaderboard.view',

  // ═══ Special Activities ═══
  SPECIAL_VIEW: 'special.view',
  SPECIAL_MANAGE: 'special.manage',

  // ═══ Meetups ═══
  MEETUPS_VIEW: 'meetups.view',
  MEETUPS_MANAGE: 'meetups.manage',

  // ═══ Badges ═══
  BADGES_VIEW: 'badges.view',
  BADGES_MANAGE: 'badges.manage',

  // ═══ Auto-Verification ═══
  AUTO_VERIFY_VIEW: 'auto_verify.view',
  AUTO_VERIFY_MANAGE: 'auto_verify.manage',

  // ═══ Popup Messages ═══
  POPUPS_VIEW: 'popups.view',
  POPUPS_MANAGE: 'popups.manage',

  // ═══ Communication ═══
  BROADCAST_SEND: 'broadcast.send',

  // ═══ Data & Reports ═══
  EXPORT_DATA: 'export.data',
  REPORTS_VIEW: 'reports.view',
  ANALYTICS_VIEW: 'analytics.view',

  // ═══ System ═══
  SETTINGS_ACCESS: 'settings.access',
  ADMINS_VIEW: 'admins.view',
  ADMINS_MANAGE: 'admins.manage',
};

const PERMISSION_GROUPS = [
  {
    group: 'Activities',
    permissions: [
      { key: PERMISSIONS.ACTIVITIES_VIEW, label: 'View Activities', desc: 'See activity submissions' },
      { key: PERMISSIONS.ACTIVITIES_MANAGE, label: 'Manage Activities', desc: 'Approve, reject, bulk actions' },
    ],
  },
  {
    group: 'Members',
    permissions: [
      { key: PERMISSIONS.MEMBERS_VIEW, label: 'View Members', desc: 'See member list' },
      { key: PERMISSIONS.MEMBERS_MANAGE, label: 'Manage Members', desc: 'Block, adjust points' },
      { key: PERMISSIONS.MEMBERS_EDIT, label: 'Edit Member Profiles', desc: 'Edit name, Xiaomi ID, WhatsApp, socials' },
    ],
  },
  {
    group: 'Leaderboard',
    permissions: [
      { key: PERMISSIONS.LEADERBOARD_VIEW, label: 'View Leaderboard', desc: 'See rankings & export' },
    ],
  },
  {
    group: 'Special Activities',
    permissions: [
      { key: PERMISSIONS.SPECIAL_VIEW, label: 'View Special Activities', desc: 'See campaigns' },
      { key: PERMISSIONS.SPECIAL_MANAGE, label: 'Manage Special Activities', desc: 'Create, edit, verify submissions' },
    ],
  },
  {
    group: 'Meetups',
    permissions: [
      { key: PERMISSIONS.MEETUPS_VIEW, label: 'View Meetups', desc: 'See meetups & RSVPs' },
      { key: PERMISSIONS.MEETUPS_MANAGE, label: 'Manage Meetups', desc: 'Create, edit, check-in, review links' },
    ],
  },
  {
    group: 'Badges',
    permissions: [
      { key: PERMISSIONS.BADGES_VIEW, label: 'View Badge Manager', desc: 'See badge catalog & users' },
      { key: PERMISSIONS.BADGES_MANAGE, label: 'Manage Badges', desc: 'Give, remove, bulk award badges' },
    ],
  },
  {
    group: 'Auto-Verification',
    permissions: [
      { key: PERMISSIONS.AUTO_VERIFY_VIEW, label: 'View Auto-Verify', desc: 'See settings & logs' },
      { key: PERMISSIONS.AUTO_VERIFY_MANAGE, label: 'Manage Auto-Verify', desc: 'Toggle, timing, override' },
    ],
  },
  {
    group: 'Popup Messages',
    permissions: [
      { key: PERMISSIONS.POPUPS_VIEW, label: 'View Popups', desc: 'See popup list' },
      { key: PERMISSIONS.POPUPS_MANAGE, label: 'Manage Popups', desc: 'Create, edit, activate popups' },
    ],
  },
  {
    group: 'Communication',
    permissions: [
      { key: PERMISSIONS.BROADCAST_SEND, label: 'Send Broadcast', desc: 'Notify members via Telegram' },
    ],
  },
  {
    group: 'Data & Reports',
    permissions: [
      { key: PERMISSIONS.EXPORT_DATA, label: 'Export Data', desc: 'CSV/Excel/PDF downloads' },
      { key: PERMISSIONS.REPORTS_VIEW, label: 'View Reports', desc: 'Monthly & member-wise reports' },
      { key: PERMISSIONS.ANALYTICS_VIEW, label: 'View Analytics', desc: 'Dashboard analytics' },
    ],
  },
  {
    group: 'System',
    permissions: [
      { key: PERMISSIONS.SETTINGS_ACCESS, label: 'Access Settings', desc: 'Open settings page' },
      { key: PERMISSIONS.ADMINS_VIEW, label: 'View Admins', desc: 'See admin list' },
      { key: PERMISSIONS.ADMINS_MANAGE, label: 'Manage Admins', desc: 'Create, edit, delete admins' },
    ],
  },
];

const DEFAULT_ADMIN_PERMISSIONS = [
  PERMISSIONS.ACTIVITIES_VIEW,
  PERMISSIONS.ACTIVITIES_MANAGE,
  PERMISSIONS.SETTINGS_ACCESS,
];

const SUPER_ADMIN_PERMISSIONS = Object.values(PERMISSIONS);

const hasPermission = (admin, permission) => {
  if (!admin) return false;
  if (admin.role === 'SUPER_ADMIN') return true;
  return Array.isArray(admin.permissions) && admin.permissions.includes(permission);
};

const hasAnyPermission = (admin, permissions) => {
  if (!admin) return false;
  if (admin.role === 'SUPER_ADMIN') return true;
  return permissions.some((p) => hasPermission(admin, p));
};

module.exports = {
  PERMISSIONS,
  PERMISSION_GROUPS,
  DEFAULT_ADMIN_PERMISSIONS,
  SUPER_ADMIN_PERMISSIONS,
  hasPermission,
  hasAnyPermission,
};