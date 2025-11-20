/**
 * Password Verifier
 * 
 * Run this script to test if a password matches a hash:
 * node scripts/verify-password.js <password> <hash>
 */

const bcrypt = require('bcryptjs');

const password = process.argv[2];
const hash = process.argv[3];

if (!password || !hash) {
  console.error('Usage: node scripts/verify-password.js <password> <hash>');
  process.exit(1);
}

const isMatch = bcrypt.compareSync(password, hash);

if (isMatch) {
  console.log('\n✅ Password matches the hash!\n');
} else {
  console.log('\n❌ Password does NOT match the hash.\n');
}
