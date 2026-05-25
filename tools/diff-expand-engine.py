# -*- coding: utf-8 -*-
import pathlib
import re
import difflib

root = pathlib.Path(__file__).resolve().parents[1]
html_lines = (root / "docs" / "index.html").read_text(encoding="utf-8").splitlines()
shared_lines = (root / "docs" / "shared" / "expand-brackets-questions.js").read_text(
    encoding="utf-8"
).splitlines()

start = next(i for i, l in enumerate(html_lines) if "拆括号 L1" in l)
end = next(
    i
    for i, l in enumerate(html_lines)
    if i > start and "function shouldHideExpandCauseLabels" in l
)
idx_chunk = html_lines[start:end]

idx_start = next(i for i, l in enumerate(idx_chunk) if "EB_LETTERS" in l)
s_start = next(i for i, l in enumerate(shared_lines) if "EB_LETTERS" in l)
s_end = next(
    i
    for i, l in enumerate(shared_lines)
    if i > s_start and l.strip().startswith("function buildExpandBracketsQuestion")
)


def normalize(lines):
    out = []
    for line in lines:
        l = line.rstrip()
        if l.startswith("    "):
            l = l[4:]
        # game uses t("key") || fallback; shared may use literal only
        l = re.sub(r'\bt\("[^"]+"\)\s*\|\|\s*', "", l)
        l = re.sub(r'\bt\("[^"]+"\)', '""', l)
        out.append(l)
    return out


a = normalize(idx_chunk[idx_start:])
b = normalize(shared_lines[s_start:s_end])

diff = list(difflib.unified_diff(a, b, lineterm="", n=3))
print("index lines:", len(a))
print("shared lines:", len(b))
print("diff lines:", len(diff))
if not diff:
    print("NO_DIFFERENCES (after normalizing t() calls)")
else:
    for line in diff:
        print(line)

# Also find lines with t( in index only
print("\n--- index.html t() usages in expand block ---")
for i, l in enumerate(idx_chunk):
    if re.search(r'\bt\("', l):
        print(f"  idx+{start+i+1}: {l.strip()}")

print("\n--- shared t() usages ---")
for i, l in enumerate(shared_lines):
    if re.search(r'\bt\("', l):
        print(f"  shared+{i+1}: {l.strip()}")
