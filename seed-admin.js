require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const Admin = require('./src/models/Admin');

const seedAdmin = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB connected');

    const email = 'admin@xfcpatna.com';
    const password = 'XFC@Admin2026';

    const existing = await Admin.findOne({ email });
    if (existing) {
      console.log('⚠️  Admin already exists:', email);
      process.exit(0);
    }

    const password_hash = await bcrypt.hash(password, 10);
    await Admin.create({
      email,
      password_hash,
      name: 'Super Admin',
      role: 'SUPER_ADMIN',
    });

    console.log('═══════════════════════════════════════');
    console.log('✅ ADMIN CREATED SUCCESSFULLY');
    console.log('═══════════════════════════════════════');
    console.log('  Email:    ', email);
    console.log('  Password: ', password);
    console.log('  Role:     SUPER_ADMIN');
    console.log('═══════════════════════════════════════');
    console.log('⚠️  CHANGE PASSWORD AFTER FIRST LOGIN!');
    console.log('═══════════════════════════════════════');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
};

seedAdmin();