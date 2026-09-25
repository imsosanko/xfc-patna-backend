const PERMISSIONS = {
  ACTIVITIES_VIEW: 'activities.view',
  ACTIVITIES_MANAGE: 'activities.manage',
  MEMBERS_VIEW: 'members.view',
  MEMBERS_MANAGE: 'members.manage',
  MEMBERS_EDIT: 'members.edit',          // ⬅️ NEW — Member profile edit permission
  SPECIAL_VIEW: 'special.view',
  SPECIAL_MANAGE: 'special.manage',
  MEETUPS_VIEW: 'meetups.view',
  MEETUPS_MANAGE: 'meetups.manage',
  BROADCAST_SEND: 'broadcast.send',
  EXPORT_DATA: 'export.data',
  REPORTS_VIEW: 'reports.view',
  ANALYTICS_VIEW: 'analytics.view',
  SETTINGS_ACCESS: 'settings.access',
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
      { key: PERMISSIONS.MEMBERS_EDIT, label: 'Edit Member Profiles', desc: 'Edit name, Xiaomi ID, WhatsApp, social links' },  // ⬅️ NEW
    ],
  },
  {
    group: 'Special Activities',
    permissions: [
      { key: PERMISSIONS.SPECIAL_VIEW, label: 'View Special Activities', desc: 'See campaigns' },
      { key: PERMISSIONS.SPECIAL_MANAGE, label: 'Manage Special Activities', desc: 'Create, edit' },
    ],
  },
  {
    group: 'Meetups',
    permissions: [
      { key: PERMISSIONS.MEETUPS_VIEW, label: 'View Meetups', desc: 'See meetups' },
      { key: PERMISSIONS.MEETUPS_MANAGE, label: 'Manage Meetups', desc: 'Create, edit, check-in' },
    ],
  },
  {
    group: 'Communication',
    permissions: [
      { key: PERMISSIONS.BROADCAST_SEND, label: 'Send Broadcast', desc: 'Notify members' },
    ],
  },
  {
    group: 'Data & Reports',
    permissions: [
      { key: PERMISSIONS.EXPORT_DATA, label: 'Export Data', desc: 'CSV downloads' },
      { key: PERMISSIONS.REPORTS_VIEW, label: 'View Reports', desc: 'Reports' },
      { key: PERMISSIONS.ANALYTICS_VIEW, label: 'View Analytics', desc: 'Analytics' },
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

module.exports = {
  PERMISSIONS,
  PERMISSION_GROUPS,
  DEFAULT_ADMIN_PERMISSIONS,
  SUPER_ADMIN_PERMISSIONS,
  hasPermission,
};