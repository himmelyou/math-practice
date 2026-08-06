const fs = require("fs");
const p = "server/server.js";
let s = fs.readFileSync(p, "utf8");

function rep(re, to, label) {
  const m = s.match(re);
  const c = m ? m.length : 0;
  if (c) {
    s = s.replace(re, to);
    console.log(label, c);
  }
}

rep(
  /const runsData = readJson\(RUNS_FILE, \{ runs: \{\} \}\);\r?\n(\s*)const runs = runsData\.runs\[username\] \|\| \[\];/g,
  "$1const runs = runsStore.getUserRuns(username);",
  "simple getUserRuns"
);

rep(
  /const runsData = readJson\(RUNS_FILE, \{ runs: \{\} \}\);\r?\n(\s*)const runs = \(runsData\.runs\[username\] \|\| \[\]\)\r?\n\s*\.map\(\(r\) => \(\{\r?\n\s*\.\.\.r,\r?\n\s*mode: normalizeRunMode\(r\.mode\),\r?\n\s*\}\)\)\r?\n\s*\.sort\(\(a, b\) => \(b\.ts \|\| 0\) - \(a\.ts \|\| 0\)\);/g,
  `$1const runs = runsStore.getUserRuns(username)
$1  .map((r) => ({
$1    ...r,
$1    mode: normalizeRunMode(r.mode),
$1  }))
$1  .sort((a, b) => (b.ts || 0) - (a.ts || 0));`,
  "map+sort multiline"
);

rep(
  /const runsData = readJson\(RUNS_FILE, \{ runs: \{\} \}\);\r?\n(\s*)const runs = \(runsData\.runs\[username\] \|\| \[\]\)\r?\n\s*\.map\(\(r\) => \(\{ \.\.\.r, mode: normalizeRunMode\(r\.mode\) \}\)\)\r?\n\s*\.sort\(\(a, b\) => \(b\.ts \|\| 0\) - \(a\.ts \|\| 0\)\);/g,
  `$1const runs = runsStore.getUserRuns(username)
$1  .map((r) => ({ ...r, mode: normalizeRunMode(r.mode) }))
$1  .sort((a, b) => (b.ts || 0) - (a.ts || 0));`,
  "map+sort compact"
);

rep(
  /const runsData = readJson\(RUNS_FILE, \{ runs: \{\} \}\);\r?\n(\s*)const runs = \(runsData\.runs\[username\] \|\| \[\]\)\.map\(\(r\) => \(\{\r?\n\s*\.\.\.r,\r?\n\s*mode: normalizeRunMode\(r\.mode\),\r?\n\s*\}\)\);/g,
  `$1const runs = runsStore.getUserRuns(username).map((r) => ({
$1  ...r,
$1  mode: normalizeRunMode(r.mode),
$1}));`,
  "map only"
);

rep(
  /const runsData = readJson\(RUNS_FILE, \{ runs: \{\} \}\);\r?\n(\s*)const runs = runsData\.runs && Array\.isArray\(runsData\.runs\[username\]\) \? runsData\.runs\[username\] : \[\];/g,
  "$1const runs = runsStore.getUserRuns(username);",
  "array isArray variant"
);

fs.writeFileSync(p, s);
console.log("remaining readJson RUNS", (s.match(/readJson\(RUNS_FILE/g) || []).length);
console.log("remaining writeJson RUNS", (s.match(/writeJson\(RUNS_FILE/g) || []).length);
