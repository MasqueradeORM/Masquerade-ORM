import fs from "fs"
import path from "path"

const header = `// Copyright 2026 B.G (github.com/MasqueradeORM)
// SPDX-License-Identifier: Apache-2.0

`
const targetDirs = ["bin", "testing", "docs", "src"]

function walk(dir) {
  if (!fs.existsSync(dir)) return

  for (const file of fs.readdirSync(dir)) {
    const full = path.join(dir, file)
        const ext = path.extname(full)

    if (fs.statSync(full).isDirectory()) {
      walk(full)
    } else if (([".js", ".ts", ".d.ts"].includes(ext))) {
      const content = fs.readFileSync(full, "utf8")

      if (!content.includes("SPDX-License-Identifier")) {
        fs.writeFileSync(full, header + content)
        console.log("Updated:", full)
      }
    }
  }
}

for (const dir of targetDirs) {
  walk(path.join(process.cwd(), dir))
}
