import { store } from "./store"
import { createSourceFile, SyntaxKind, ScriptKind, ScriptTarget } from "typescript"


export default function (source) {
	const nodes = Object.values(source).map(source => createSourceFile('', source.toString(), ScriptTarget.Latest, true, ScriptKind.TSX).statements[0])
	for (const node of nodes) {
		//@ts-ignore
		if ((node.kind === SyntaxKind.ClassDeclaration || node.kind === SyntaxKind.ClassExpression) && node.heritageClauses)
					//@ts-ignore
			store.nodeArr.push(node)
	}
	return source
}
