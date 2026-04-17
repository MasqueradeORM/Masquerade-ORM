// Copyright 2026 B.G (github.com/MasqueradeORM)
// SPDX-License-Identifier: Apache-2.0

import { nonSnake2Snake } from "../../misc/miscFunctions.js"
import { Alias, aliasSymb } from "../../misc/classes.js"
import { classWiki2ScopeObj, deproxifyScopeProxy, findPropOnScopeProxy } from "./scopeProxies.js"
import { OrmStore } from "../../misc/ormStore.js"
import { proxyKeyDict, removeRelationFromUnusedRelations } from "./find.js"


// /**
//  * @typedef {Object} StatementsObj
//  * @property {string[]} statements
//  * @property {any[]} params
//  */

/**
 * @typedef {Object} parsedTemplateObj
 * @property {string} statement
 * @property {any[]} params
 */

export function templateFuncs2Statements(
    /**@type {function}*/ templateFunc, 
    templateAliasObj, 
    /**@type {number | undefined}*/ paramIndex = undefined,
    queryStr = ''
) {
    const templateResObj = templateFunc(templateAliasObj)
    /**@type {parsedTemplateObj}*/ const returnedObj = { statement: '', params: [] }
    const {__strings__: strings, __params__: params} = templateResObj
    if (paramIndex === undefined) paramIndex = 1
    while (strings.length + params.length > 0) {
        if (strings.length) queryStr += strings.shift()
        if (params.length) {
            const param = params.shift()
            if (param instanceof Alias) {
                if (param[aliasSymb] === `_InvalidPlaceholder_`) throw new Error(param.errMsg)
                else queryStr += param[aliasSymb]
            }
            else {
                queryStr += `$${paramIndex++}`
                returnedObj.params.push(param)
            }
        }
    }
    returnedObj.statement = queryStr.trim()
    return returnedObj
}


export function createFullAndFlatAliasObj(scopeObj, fullFlatAliasObj = {}) {
    const alias = scopeObj.alias
    const columnProperties = Object.keys(scopeObj.columns)

    for (const propertyName of columnProperties)
        fullFlatAliasObj[propertyName] = new Alias(alias + `.` + nonSnake2Snake(propertyName))

    if (scopeObj.junctions) {
        const relations = scopeObj.junctions
        const relationKeys = Object.keys(relations)
        for (const key of relationKeys) {
            const errMsg = `Invalid substitution in template function - '${key}' is a substitution for a table, not a column.`
            fullFlatAliasObj[key] = new Alias(`_InvalidPlaceholder_`, errMsg) //this isnt really needed, can be an object, but this guarantees an error
            createFullAndFlatAliasObj(relations[key], fullFlatAliasObj[key])
        }
    }
    if (scopeObj.parent) createFullAndFlatAliasObj(scopeObj.parent, fullFlatAliasObj)

    return fullFlatAliasObj
}

export function mergeTemplateScope(proxyMap, templateFunc, /**@type {'templateWhere' | 'templateOrderBy'}*/ templateType) {
    if (typeof templateFunc !== "function") {
        if (templateFunc !== null) throw new Error(`'${templateType}' expects a function.`)
        return
    }
    let scopeObj = deproxifyScopeProxy(proxyMap)
    const classWiki = OrmStore.store.classWikiDict[scopeObj.className_]
    const templateProxy = createTemplateProxy(scopeObj, classWiki)
    templateFunc(templateProxy)
    scopeObj = deproxifyScopeProxy(templateProxy)
    scopeObj[`${templateType}_`] = templateFunc
    return reproxyWikiPostTemplateFunc(scopeObj, classWiki)
}

function reproxyWikiPostTemplateFunc(scopeObj, classWiki) {
    if (scopeObj.parent_) scopeObj.parent_ = reproxyWikiPostTemplateFunc(scopeObj.parent_, classWiki.parent)

    if (scopeObj.junctions_) {
        const mapRelations = scopeObj.junctions_
        for (const key of Object.keys(mapRelations))
            mapRelations[key] = reproxyWikiPostTemplateFunc(mapRelations[key], classWiki.junctions[key])
    }

    const proxy = new Proxy(scopeObj, {
        get: (target, key) => {
            if (proxyKeyDict[key]) return target[key]
            else if (key === "raw_") return target
            // else if (key === proxyType) return 'categorizingProxy'
            else return findPropOnScopeProxy(target, key, classWiki.className)
        }
    })
    return proxy
}

export function createTemplateProxy(scopeObj, classWiki) {
    if (classWiki.parent) {
        let parent
        if (!scopeObj.parent_) parent = classWiki2ScopeObj(classWiki)
        else parent = scopeObj.parent_
        const parentOrmMap = classWiki.parent
        scopeObj.parent_ = createTemplateProxy(parent, parentOrmMap)
    }

    if (scopeObj.junctions_) {
        const mapRelations = scopeObj.junctions_
        for (const key of Object.keys(mapRelations)) {
            const relationOrmMap = classWiki.junctions[key]
            mapRelations[key] = createTemplateProxy(mapRelations[key], relationOrmMap)
        }
    }

    const proxy = new Proxy(scopeObj, {
        get: (target, key) => {
            if (proxyKeyDict[key]) return target[key]
            else if (key === "raw_") return target
            // else if (key === proxyType) return 'relationalWhereProxy'
            else return findPropOnProxy(target, key, classWiki)
        }
    })
    return proxy
}

export function findPropOnProxy(scopeObj, key, classWiki) {
    scopeObj.junctions_ ??= {}
    if (scopeObj.uncalledJunctions_[key]) {
        const relation = scopeObj.uncalledJunctions_[key]
        const formattedRelationObj = classWiki2ScopeObj(relation)
        removeRelationFromUnusedRelations(scopeObj, key)
        const proxyRelations = scopeObj.junctions_
        proxyRelations[key] = createTemplateProxy(formattedRelationObj, classWiki.junctions[key])
        return proxyRelations[key]
    }
    else if (scopeObj.columns_[key]) return scopeObj.columns_[key]
    else if (scopeObj.junctions_[key]) return scopeObj.junctions_[key]
    else if (scopeObj.parent_) return findPropOnProxy(scopeObj.parent_, key, classWiki.parent)
    else throw new Error(`\n'${key}' is not a valid property of class ${classWiki.className}. Please fix the 'find' function's templateWhere. \nHint: use intellisense.`)
}
