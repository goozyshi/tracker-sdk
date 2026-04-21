import fs from "node:fs";
import path from "node:path";

for (const dir of ['dist/es', 'dist/lib']) {
  if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir)) {
    if (f.endsWith(".d.mts") || f.endsWith(".d.cts")) {
      const next = f.replace(/\.d\.(m|c)ts$/, ".d.ts");
      fs.renameSync(path.join(dir, f), path.join(dir, next));
    }
  }
}
