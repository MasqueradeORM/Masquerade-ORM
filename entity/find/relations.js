import { removeRelationFromUnusedRelations } from "./find.js"
import { classWiki2ScopeProxy } from "./scopeProxies.js"

export function mergeRelationsScope(scopeProxy, relationsObj) {
    if (relationsObj === true) return
    else if (!(relationsObj instanceof Object) || Array.isArray(relationsObj))
        throw new Error
            (
                `\nThe 'relations' field of the find function's argument must be an object with values of either boolean trues or objects.`
            )

    const relationEntries = Object.entries(relationsObj)
    for (const [key, objOrTrue] of relationEntries) {
        const [value, classMap, keyCategory] = scopeProxy[key]
        if (keyCategory !== "uncalledJunctions_") throw new Error(`\n'${key}' is not a valid relational property of class ${scopeProxy.className_}.`)
        else {
            removeRelationFromUnusedRelations(classMap, key)
            classMap.junctions_ ??= {}
            classMap.junctions_[key] = classWiki2ScopeProxy(value)
            if (objOrTrue) mergeRelationsScope(classMap.junctions_[key], objOrTrue)
        }
    }
}