import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const TARGET_DIRS = ['src'];
const TARGET_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.json', '.md']);

const suspiciousPatterns = [
  {
    kind: 'mojibake',
    regex: /(?:Ãƒ|Ã¢|Ã‚|Ã¦|Ã¥|Ã§|Ã©|Ã¯|Î£|Ï€|Î“Ã‡|â‚¬â„¢|â‚¬|â„¢|Å’|â€¹|â€º|Â¢|Â£|Â¤|Â¥)/g,
  },
  { kind: 'replacement-question-run', regex: /\?{3,}/g },
];

const findings = [];

function walk(dirPath) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.git')) {
      continue;
    }

    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath);
      continue;
    }

    if (!TARGET_EXTS.has(path.extname(entry.name))) {
      continue;
    }

    inspectFile(fullPath);
  }
}

function inspectFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);

  lines.forEach((line, index) => {
    for (const pattern of suspiciousPatterns) {
      const matches = [...line.matchAll(pattern.regex)];
      if (matches.length === 0) continue;

      const isAllowedDoubleQuestion =
        pattern.kind === 'replacement-question-run' && !/\?{3,}/.test(line);

      if (isAllowedDoubleQuestion) {
        continue;
      }

      findings.push({
        filePath: path.relative(ROOT, filePath),
        line: index + 1,
        kind: pattern.kind,
        text: line.trim(),
      });
      break;
    }
  });
}

for (const dir of TARGET_DIRS) {
  const fullDir = path.join(ROOT, dir);
  if (fs.existsSync(fullDir)) {
    walk(fullDir);
  }
}

if (findings.length > 0) {
  console.error('Found suspicious text encoding issues:\n');
  for (const finding of findings) {
    console.error(`${finding.filePath}:${finding.line} [${finding.kind}] ${finding.text}`);
  }
  process.exit(1);
}

console.log('No suspicious text encoding issues found.');
