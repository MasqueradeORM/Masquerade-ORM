import { Alias, aliasSymb } from "../../misc/classes.js"
import { getType } from "../../misc/miscFunctions.js"
import { OrmStore } from "../../misc/ormStore.js"
import { removeRelationFromUnusedRelations } from "./find.js"
import { classWiki2ScopeProxy } from "./scopeProxies.js"
import { mergeTemplateScope, templateFuncs2Statements } from "./templateProxies.js"

export function mergeOrderByScope(scopeProxy, orderByArg, argOrderIndex = { index: 0 }) {
    const entries = Object.entries(orderByArg)
    const classWikiDict = OrmStore.store.classWikiDict
    for (const [key, val] of entries) {
        if (key === '$aggregate') {
            scopeProxy.aggregate_ = !!val
            continue
        }
        else if (key === '$templateOrderBy') {
            scopeProxy = mergeTemplateScope(scopeProxy, val, "templateOrderBy")
            scopeProxy.templateOrderBy_ = [val, argOrderIndex.index++]
            continue
        }

        const valType = getType(val)
        const [value, classProxy4Key, keyCategory] = scopeProxy[key]
        if (keyCategory === "columns_") {
            if (valType !== "function" && valType !== "string")
                throw new Error(
                    `\nThe 'orderBy' field of the 'find' function's argument must be an object whose non-relational properties have values of type 'function' or the strings 'ASC' or 'DESC'.`
                )
            classProxy4Key.orderBy_ ??= {}
            classProxy4Key.orderBy_[key] = [val, argOrderIndex.index++]
        }
        else if (keyCategory === "uncalledJunctions_" || keyCategory === "junctions_") {
            if (valType !== "object")
                throw new Error(
                    `\nThe 'orderBy' field of the 'find' function's argument must be an object whose relational properties have values of type 'object'.`
                )

            if (keyCategory === "uncalledJunctions_") {
                removeRelationFromUnusedRelations(classProxy4Key, key)
                classProxy4Key.junctions_ ??= {}
                classProxy4Key.junctions_[key] = classWiki2ScopeProxy(classWikiDict[value.className])
            }

            const passedScopeProxy = classProxy4Key.junctions_[key]
            mergeOrderByScope(passedScopeProxy, val, argOrderIndex)
        }
    }
}

export function parseTemplateOrderBy(templateOrderByArr, aliasObj, orderByDict) {
    const [templateFunc, index] = templateOrderByArr
    const { statement, params } = templateFuncs2Statements(templateFunc, aliasObj)
    orderByDict.statements[index] = statement
    orderByDict.params.push(...params)
}


export function orderByValues2Statements(aliasObj, orderByVals, statementsObj) {
    const { statements, params } = statementsObj
    let paramIndex = params.length + 1
    for (const [propertyName, [val, index]] of Object.entries(orderByVals)) {
        const aliasName = Alias.createColumnId(aliasObj, propertyName)
        if (typeof val === 'function') {
            let queryStr = ``
            const sqlOutput = val(new Alias(aliasName))
            while (sqlOutput.params.length + sqlOutput.strings.length > 0) {
                sqlOutput.strings.length && (queryStr += sqlOutput.strings.shift())
                if (sqlOutput.params.length) {
                    const param = sqlOutput.params.shift()
                    if (param instanceof Alias) queryStr += param[aliasSymb]
                    else {
                        queryStr += `$${paramIndex++}`
                        params.push(param)
                    }
                    //else throw new Error(`\nError in 'sortBy' field of 'find' function's argument: function provided to property '${propertyName}' is invalid.`)
                }
            }
            statements[index] = `${queryStr.trim()}` 
        }
        else statements[index] = `${aliasName} ${val}`
    }
}
