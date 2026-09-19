const bcrypt = require('bcryptjs');
const Admin = require('../models/Admin');
const AuditLog = require('../models/AuditLog');
const {
  PERMISSIONS,
  PERMISSION_GROUPS,
  DEFAULT_ADMIN_PERMISSIONS,
} = require('../constants/permissions');

// ═══════════════════════════════════════════
// GET CURRENT ADMIN INFO
// GET /api/admin/me
// ═══════════════════════════════════════════
const getMe = async (req, res) => {
  try {
    res.json({
      success: true,
      admin: {
        id: req.admin._id,
        email: req.admin.email,
        name: req.admin.name,
        role: req.admin.role,
        permissions: req.admin.permissions || [],
        last_login: req.admin.last_login,
        created_at: req.admin.createdAt,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════
// GET AVAILABLE PERMISSIONS (for UI)
// GET /api/admin/admins/permissions
// ═══════════════════════════════════════════
const getAvailablePermissions = async (req, res) => {
  try {
    res.json({
      success: true,
      groups: PERMISSION_GROUPS,
      defaults: DEFAULT_ADMIN_PERMISSIONS,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════
// CHANGE OWN PASSWORD
// POST /api/admin/me/change-password
// ═══════════════════════════════════════════
const changeOwnPassword = async (req, res) => {
  try {
    const { current_password, new_password } = req.body;

    if (!current_password || !new_password) {
      return res.status(400).json({
        success: false,
        error: 'Current password and new password are required',
      });
    }

    if (new_password.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'New password must be at least 6 characters',
      });
    }

    if (current_password === new_password) {
      return res.status(400).json({
        success: false,
        error: 'New password must be different from current password',
      });
    }

    const isValid = await bcrypt.compare(current_password, req.admin.password_hash);
    if (!isValid) {
      return res.status(401).json({
        success: false,
        error: 'Current password is incorrect',
      });
    }

    const newHash = await bcrypt.hash(new_password, 10);

    await Admin.findByIdAndUpdate(req.admin._id, {
      password_hash: newHash,
      password_changed_at: new Date(),
    });

    await AuditLog.create({
      admin_id: req.admin._id,
      action: 'CHANGE_OWN_PASSWORD',
      target_type: 'ADMIN',
      target_id: req.admin._id,
      new_value: { changed_at: new Date() },
    });

    res.json({
      success: true,
      message: 'Password changed successfully',
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════
// LIST ALL ADMINS
// GET /api/admin/admins
// ═══════════════════════════════════════════
const listAdmins = async (req, res) => {
  try {
    const admins = await Admin.find()
      .sort({ role: 1, createdAt: -1 })
      .select('-password_hash')
      .lean();

    const enriched = await Promise.all(
      admins.map(async (a) => {
        let creator = null;
        if (a.created_by) {
          creator = await Admin.findById(a.created_by)
            .select('name email')
            .lean();
        }
        return {
          id: a._id,
          email: a.email,
          name: a.name,
          role: a.role,
          permissions: a.permissions || [],
          permissions_count: (a.permissions || []).length,
          is_active: a.is_active,
          last_login: a.last_login,
          created_at: a.createdAt,
          created_by: creator
            ? { name: creator.name, email: creator.email }
            : null,
          is_self: a._id.toString() === req.admin._id.toString(),
        };
      })
    );

    res.json({
      success: true,
      count: enriched.length,
      admins: enriched,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════
// CREATE NEW ADMIN
// POST /api/admin/admins
// ═══════════════════════════════════════════
const createAdmin = async (req, res) => {
  try {
    const { name, email, password, permissions } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Name, email, and password are required',
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'Password must be at least 6 characters',
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email format',
      });
    }

    const existing = await Admin.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(409).json({
        success: false,
        error: 'An admin with this email already exists',
      });
    }

    const validPermissions = Object.values(PERMISSIONS);
    const cleanPermissions = Array.isArray(permissions)
      ? permissions.filter((p) => validPermissions.includes(p))
      : [];

    const password_hash = await bcrypt.hash(password, 10);

    const admin = await Admin.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password_hash,
      role: 'ADMIN',
      permissions: cleanPermissions,
      is_active: true,
      created_by: req.admin._id,
      password_changed_at: new Date(),
    });

    await AuditLog.create({
      admin_id: req.admin._id,
      action: 'CREATE_ADMIN',
      target_type: 'ADMIN',
      target_id: admin._id,
      new_value: {
        name: admin.name,
        email: admin.email,
        permissions: cleanPermissions,
      },
    });

    res.json({
      success: true,
      message: 'Admin created successfully',
      admin: {
        id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        permissions: admin.permissions,
        is_active: admin.is_active,
      },
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        error: 'An admin with this email already exists',
      });
    }
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════
// UPDATE ADMIN (name, permissions, is_active)
// PATCH /api/admin/admins/:id
// ═══════════════════════════════════════════
const updateAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, permissions, is_active } = req.body;

    // Self protection
    if (id === req.admin._id.toString()) {
      if (name) {
        await Admin.findByIdAndUpdate(id, { name: name.trim() });
        return res.json({ success: true, message: 'Name updated' });
      }
      return res.status(400).json({
        success: false,
        error: 'You cannot modify your own role or status',
      });
    }

    const admin = await Admin.findById(id);
    if (!admin) {
      return res.status(404).json({ success: false, error: 'Admin not found' });
    }

    if (admin.role === 'SUPER_ADMIN') {
      return res.status(403).json({
        success: false,
        error: 'Cannot modify another SUPER_ADMIN',
      });
    }

    const previous = {
      name: admin.name,
      permissions: admin.permissions,
      is_active: admin.is_active,
    };

    if (name && name.trim()) admin.name = name.trim();

    if (Array.isArray(permissions)) {
      const validPermissions = Object.values(PERMISSIONS);
      admin.permissions = permissions.filter((p) =>
        validPermissions.includes(p)
      );
    }

    if (typeof is_active === 'boolean') admin.is_active = is_active;

    await admin.save();

    await AuditLog.create({
      admin_id: req.admin._id,
      action: 'UPDATE_ADMIN',
      target_type: 'ADMIN',
      target_id: admin._id,
      previous_value: previous,
      new_value: {
        name: admin.name,
        permissions: admin.permissions,
        is_active: admin.is_active,
      },
    });

    res.json({
      success: true,
      message: 'Admin updated successfully',
      admin: {
        id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        permissions: admin.permissions,
        is_active: admin.is_active,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════
// RESET ADMIN PASSWORD
// POST /api/admin/admins/:id/reset-password
// ═══════════════════════════════════════════
const resetAdminPassword = async (req, res) => {
  try {
    const { id } = req.params;
    const { new_password } = req.body;

    if (!new_password || new_password.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'New password must be at least 6 characters',
      });
    }

    if (id === req.admin._id.toString()) {
      return res.status(400).json({
        success: false,
        error: 'Use "Change Password" for your own password',
      });
    }

    const admin = await Admin.findById(id);
    if (!admin) {
      return res.status(404).json({ success: false, error: 'Admin not found' });
    }

    if (admin.role === 'SUPER_ADMIN') {
      return res.status(403).json({
        success: false,
        error: 'Cannot reset another SUPER_ADMIN password',
      });
    }

    const password_hash = await bcrypt.hash(new_password, 10);

    await Admin.findByIdAndUpdate(id, {
      password_hash,
      password_changed_at: new Date(),
    });

    await AuditLog.create({
      admin_id: req.admin._id,
      action: 'RESET_ADMIN_PASSWORD',
      target_type: 'ADMIN',
      target_id: id,
      new_value: { reset_at: new Date() },
    });

    res.json({
      success: true,
      message: 'Password reset successfully',
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════
// DELETE ADMIN
// DELETE /api/admin/admins/:id
// ═══════════════════════════════════════════
const deleteAdmin = async (req, res) => {
  try {
    const { id } = req.params;

    if (id === req.admin._id.toString()) {
      return res.status(400).json({
        success: false,
        error: 'You cannot delete yourself',
      });
    }

    const admin = await Admin.findById(id);
    if (!admin) {
      return res.status(404).json({ success: false, error: 'Admin not found' });
    }

    if (admin.role === 'SUPER_ADMIN') {
      return res.status(403).json({
        success: false,
        error: 'Cannot delete another SUPER_ADMIN',
      });
    }

    await Admin.deleteOne({ _id: id });

    await AuditLog.create({
      admin_id: req.admin._id,
      action: 'DELETE_ADMIN',
      target_type: 'ADMIN',
      target_id: id,
      previous_value: {
        name: admin.name,
        email: admin.email,
      },
    });

    res.json({
      success: true,
      message: 'Admin deleted successfully',
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════
module.exports = {
  getMe,
  getAvailablePermissions,
  changeOwnPassword,
  listAdmins,
  createAdmin,
  updateAdmin,
  resetAdminPassword,
  deleteAdmin,
};