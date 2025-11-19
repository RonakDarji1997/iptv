const bcrypt = require('bcryptjs');

const hash = '$2b$10$UB.dvoKKSv0wzuqOHhdnrOWTKxSzN56dZCwct5fQ5UyNWgH7Y4W4y';
const password = 'RonakLovesBhavika@0205';

console.log('Testing bcrypt comparison...');
console.log('Password:', password);
console.log('Hash:', hash);

bcrypt.compare(password, hash).then(result => {
  console.log('Match result:', result);
  process.exit(result ? 0 : 1);
});
