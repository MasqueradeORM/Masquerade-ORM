// Copyright 2026 B.G (github.com/MasqueradeORM)
// SPDX-License-Identifier: Apache-2.0

import { store } from "./store.js"
import { SyntaxKind } from "typescript"
import ts from "typescript"

export default function (source) {
	const sourceFile = ts.createSourceFile("", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
	const nodes = sourceFile.statements
	for (const node of nodes) {
		if (!node) continue
		//@ts-ignore
		const isValid = (node.kind === SyntaxKind.ClassDeclaration || node.kind === SyntaxKind.ClassExpression) && node.heritageClauses
		//@ts-ignore
		if (isValid) store.nodeArr.push(node)
	}
	return source
}
