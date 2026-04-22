import fs from 'node:fs';
import path from 'node:path';

for (const dir of ['dist/es', 'dist/lib']) {
  if (!fs.existsSync(dir)) continue;

  for (const f of fs.readdirSync(dir)) {
    if (f.endsWith('.d.mts') || f.endsWith('.d.cts')) {
      const next = f.replace(/\.d\.(m|c)ts$/, '.d.ts');
      fs.renameSync(path.join(dir, f), path.join(dir, next));
    }
  }

  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.d.ts')) continue;
    const p = path.join(dir, f);
    const src = fs.readFileSync(p, 'utf8');
    const out = src.replace(/(from\s+['"])(\.{1,2}\/[^'"]+?)\.(m|c)js(['"])/g, '$1$2.js$4');
    if (out !== src) fs.writeFileSync(p, out);
  }
}
