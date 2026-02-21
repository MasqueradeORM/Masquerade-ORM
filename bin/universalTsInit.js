#!/usr/bin/env node

import ts from "typescript"
import fs from "fs"
import path from "path"
import { createSourceFile, SyntaxKind, ScriptKind, ScriptTarget } from "typescript"
import { nodeArr2ClassDict } from "../src/ORM/bootOrm.js"

const configPath = ts.findConfigFile(
  "./",
  ts.sys.fileExists,
  "tsconfig.json"
)

if (!configPath) {
  throw new Error("tsconfig.json not found")
}

const configFile = ts.readConfigFile(
  configPath,
  ts.sys.readFile
)

const parsed = ts.parseJsonConfigFileContent(
  configFile.config,
  ts.sys,
  "./"
)

const program = ts.createProgram({
  rootNames: parsed.fileNames,
  options: parsed.options
})

const classNodesArr = []

for (const sourceFile of program.getSourceFiles()) {
  if (sourceFile.isDeclarationFile) continue
  const fileText = sourceFile.getFullText()
  const fileNodesArr = createSourceFile('', fileText, ScriptTarget.Latest, true, ScriptKind.TSX).statements

  for (const node of fileNodesArr) {
    //@ts-ignore
    if ((node.kind === SyntaxKind.ClassDeclaration || node.kind === SyntaxKind.ClassExpression) && node.heritageClauses) 
      classNodesArr.push(node)
  }
}

const classDict = nodeArr2ClassDict(classNodesArr)
const filePath = path.join(
  process.cwd(),
  "ormTypeScriptSetup.js"
)
const content = `export function UniversalTsSetup() {globalThis.masqueradeClassDict_ = ${JSON.stringify(classDict)};\n}`
fs.writeFileSync(filePath, content, "utf8")




