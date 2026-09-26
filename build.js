const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const parts = ['bundle.part1','bundle.part2','bundle.part3','bundle.part4','bundle.part5']
  .map((file) => fs.readFileSync(file, 'utf8'))
  .join('');

const zipped = Buffer.from(parts, 'base64');
const data = JSON.parse(zlib.gunzipSync(zipped).toString('utf8'));

fs.rmSync('public', { recursive: true, force: true });

for (const [file, content] of Object.entries(data)) {
  const target = path.join('public', file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, 'utf8');
}

console.log(`Wrote ${Object.keys(data).length} files`);
