// Copies the frontend modules the backend imports through "@/..." (and everything they import)
// into src/shared/, so the backend builds and deploys on its own (e.g. Railway).
//
// The frontend is the source of truth for these files: edit them there, then run
//   npm run sync-shared            (expects the frontend at ../learning-journey-hub)
//   npm run sync-shared -- <path>  (path to the frontend repo)
// and commit both repos. `npm run sync-shared -- --check` exits 1 if the copies differ.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const backend = path.resolve(here, "..");
const args = process.argv.slice(2);
const check = args.includes("--check");
const frontendRoot = path.resolve(backend, args.find((a) => !a.startsWith("--")) ?? "../learning-journey-hub");
const FE = path.join(frontendRoot, "src");
const OUT = path.join(backend, "src", "shared");

if (!fs.existsSync(FE)) {
  console.error(`Frontend source not found at ${FE}. Pass the frontend repo path: npm run sync-shared -- <path>`);
  process.exit(2);
}

const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const roots = ["src", "tests"].map((d) => path.join(backend, d)).filter(fs.existsSync)
  .flatMap(walk).filter((f) => /\.tsx?$/.test(f) && !f.startsWith(OUT + path.sep));

const resolve = (spec, from) => {
  const base = spec.startsWith("@/") ? path.join(FE, spec.slice(2)) : path.resolve(path.dirname(from), spec);
  for (const c of [base + ".ts", base + ".tsx", path.join(base, "index.ts")]) if (fs.existsSync(c)) return c;
  return null;
};

const seen = new Set();
const queue = [];
const scan = (file, inShared) => {
  for (const m of fs.readFileSync(file, "utf8").matchAll(/(?:from|import)\s*\(?\s*"([^"]+)"/g)) {
    const spec = m[1];
    if (!spec.startsWith("@/") && !(inShared && spec.startsWith("."))) continue;
    const target = resolve(spec, file);
    if (!target) { console.error(`Can't resolve "${spec}" imported by ${path.relative(backend, file)}`); process.exit(1); }
    if (!seen.has(target)) { seen.add(target); queue.push(target); }
  }
};
roots.forEach((f) => scan(f, false));
while (queue.length) scan(queue.shift(), true);

const wanted = new Map([...seen].map((src) => [path.join(OUT, path.relative(FE, src)), src]));
const existing = fs.existsSync(OUT) ? walk(OUT).filter((f) => /\.tsx?$/.test(f)) : [];
let changed = 0;
for (const [dest, src] of wanted) {
  const next = fs.readFileSync(src);
  if (fs.existsSync(dest) && fs.readFileSync(dest).equals(next)) continue;
  changed++;
  console.log(`${check ? "differs" : "copied "}  ${path.relative(OUT, dest).split(path.sep).join("/")}`);
  if (!check) { fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, next); }
}
for (const f of existing) {
  if (wanted.has(f)) continue;
  changed++;
  console.log(`${check ? "stale  " : "removed"}  ${path.relative(OUT, f).split(path.sep).join("/")}`);
  if (!check) fs.rmSync(f);
}
console.log(`${wanted.size} shared files, ${changed} ${check ? "out of sync" : "updated"}.`);
if (check && changed) process.exit(1);
