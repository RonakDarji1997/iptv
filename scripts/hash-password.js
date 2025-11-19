/**
 * Password Hash Generator
 * 
 * Run this script to generate a bcrypt hash for your password:
 * node scripts/hash-password.js your_password_here
 * 
 * Then copy the hash to your .env.local file
 */

const bcrypt = require('bcryptjs');

const password = process.argv[2];

if (!password) {
  console.error('Usage: node scripts/hash-password.js <password>');
  process.exit(1);
}

const salt = bcrypt.genSaltSync(10);
const hash = bcrypt.hashSync(password, salt);

console.log('\n✅ Password hash generated successfully!\n');
console.log('Copy this hash to your .env.local file:');
console.log('NEXT_PUBLIC_APP_PASSWORD_HASH=' + hash);
console.log('\nOr update your existing password in .env.local to use the hash format.\n');
