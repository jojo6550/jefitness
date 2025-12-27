const mongoose = require('mongoose');
require('dotenv').config();
const connectDB = require('../config/db');

const migrations = [
  // Add migration functions here
  // Example: async () => { /* migration logic */ }
];

const runMigrations = async () => {
  await connectDB();

  for (let i = 0; i < migrations.length; i++) {
    console.log(`Running migration ${i + 1}...`);
    try {
      await migrations[i]();
      console.log(`Migration ${i + 1} completed.`);
    } catch (error) {
      console.error(`Migration ${i + 1} failed: ${error.message}`);
      process.exit(1);
    }
  }

  console.log('All migrations completed.');
  process.exit(0);
};

module.exports = { runMigrations };

// Run if called directly
if (require.main === module) {
  runMigrations();
}
