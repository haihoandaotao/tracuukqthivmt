const bcrypt = require('bcrypt');

async function main() {
  const pwd = process.argv[2];
  if (!pwd) {
    console.error('Usage: npm run hash -- "your-password"');
    process.exit(1);
  }
  const hash = await bcrypt.hash(pwd, 12);
  console.log(hash);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
