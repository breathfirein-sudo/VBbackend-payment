const fs = require('fs');
const path = require('path');

const contentPath = path.join('C:', 'Users', 'shiva', '.gemini', 'antigravity-ide', 'brain', '32407a0a-4874-400f-ba66-312a640c52c4', '.system_generated', 'steps', '144', 'content.md');
const content = fs.readFileSync(contentPath, 'utf8');

console.log("Searching for 'render' case-insensitively:");
let index = 0;
while ((index = content.toLowerCase().indexOf('render', index)) !== -1) {
  console.log("MATCH:", content.substring(index - 40, index + 40).replace(/\n/g, ' '));
  index += 6;
}

console.log("\nSearching for 'vercel' case-insensitively:");
index = 0;
while ((index = content.toLowerCase().indexOf('vercel', index)) !== -1) {
  console.log("MATCH:", content.substring(index - 40, index + 40).replace(/\n/g, ' '));
  index += 6;
}
