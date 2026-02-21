// Copyright 2026 B.G (github.com/MasqueradeORM)
// SPDX-License-Identifier: Apache-2.0

import { Alias, aliasSymb } from "../../../misc/classes.js"
import { nonSnake2Snake } from "../../../misc/miscFunctions.js"
import { OrmStore } from "../../../misc/ormStore.js"
import { proxyType, removeRelationFromUnusedRelations } from "../find.js"
import { deproxifyScopeProxy, findPropOnScopeProxy, classWiki2ScopeObj } from "../scopeProxies.js"

export function relationalWhereFuncs2Statements(mapObj, whereObj, queryStr = ``) {
    const relationalWhereFunc = mapObj.templateWhere
    let AliasObj4func = createFullAndFlatAliasObj(mapObj)
    const sqlWhereObj = relationalWhereFunc(AliasObj4func)
    while (sqlWhereObj.params.length + sqlWhereObj.strings.length > 0) {
        let paramIndex = whereObj.params.length + 1
        if (sqlWhereObj.strings.length) queryStr += ` ` + sqlWhereObj.strings.shift()
        if (sqlWhereObj.params.length) {
            const param = sqlWhereObj.params.shift()
            if (param instanceof Alias) {
                if (param[aliasSymb] === `_InvalidPlaceholder_`) throw new Error(param.errMsg)
                else queryStr += ` ` + param[aliasSymb]
            }
            else {
                queryStr += ` $${paramIndex}`
                whereObj.params.push(param)
            }
        }
    }
    queryStr = queryStr.trim().replaceAll("  ", " ")
    whereObj.statements.push(queryStr)
}


function createFullAndFlatAliasObj(mapObj, fullFlatAliasObj = {}) {
    const alias = mapObj.alias
    const columnProperties = Object.keys(mapObj.columns)

    for (const propertyName of columnProperties)
        fullFlatAliasObj[propertyName] = new Alias(alias + `.` + nonSnake2Snake(propertyName))

    if (mapObj.junctions) {
        const relations = mapObj.junctions
        const relationKeys = Object.keys(relations)
        for (const key of relationKeys) {
            const errMsg = `Invalid substitution in relational where - '${key}' is a substitution for a table, not a column.`
            fullFlatAliasObj[key] = new Alias(`_InvalidPlaceholder_`, errMsg) //this isnt really needed, can be an object, but this guarantees an error
            createFullAndFlatAliasObj(relations[key], fullFlatAliasObj[key])
        }
    }
    if (mapObj.parent) createFullAndFlatAliasObj(mapObj.parent, fullFlatAliasObj)

    return fullFlatAliasObj
}

export function mergeTemplateWhereScope(proxyMap, relationalWhereFunc) {
    if (typeof relationalWhereFunc !== "function") throw new Error(`Relational where expects a function.`)
    let mapObj = deproxifyScopeProxy(proxyMap)
    const classWiki = OrmStore.store.classWikiDict[mapObj.className_]
    const relationalWhereMapProxy = createTemplateWhereProxy(mapObj, classWiki)
    relationalWhereFunc(relationalWhereMapProxy)
    mapObj = deproxifyScopeProxy(relationalWhereMapProxy)
    mapObj.templateWhere_ = relationalWhereFunc
    return reproxyWikiPostTemplateWhere(mapObj, classWiki)
}

function reproxyWikiPostTemplateWhere(mapObj, classWiki) {
    if (mapObj.parent_) mapObj.parent_ = reproxyWikiPostTemplateWhere(mapObj.parent_, classWiki.parent)

    if (mapObj.junctions_) {
        const mapRelations = mapObj.junctions_
        for (const key of Object.keys(mapRelations))
            mapRelations[key] = reproxyWikiPostTemplateWhere(mapRelations[key], classWiki.junctions[key])
    }

    const proxy = new Proxy(mapObj, {
        get: (target, key, reciever) => {
            if (
                key === "className_"
                || key === "parent_"
                || key === "columns_"
                || key === "uncalledJunctions_"
                || key === "junctions_"
                || key === "where_"
                || key === "templateWhere_"
                || key === "isArray_"
            ) return target[key]
            else if (key === "raw_") return target
            else if (key === proxyType) return 'categorizingProxy'
            else return findPropOnScopeProxy(target, key, classWiki.className)
        },
    })
    return proxy
}

export function createTemplateWhereProxy(mapObj, classWiki) {
    if (classWiki.parent) {
        let parent
        if (!mapObj.parent_) parent = classWiki2ScopeObj(classWiki)
        else parent = mapObj.parent_
        const parentOrmMap = classWiki.parent
        mapObj.parent_ = createTemplateWhereProxy(parent, parentOrmMap)
    }

    if (mapObj.junctions_) {
        const mapRelations = mapObj.junctions_
        for (const key of Object.keys(mapRelations)) {
            const relationOrmMap = classWiki.junctions[key]
            mapRelations[key] = createTemplateWhereProxy(mapRelations[key], relationOrmMap)
        }
    }

    const proxy = new Proxy(mapObj, {
        get: (target, key, reciever) => {
            if (
                key === "className_"
                || key === "parent_"
                || key === "columns_"
                || key === "uncalledJunctions_"
                || key === "junctions_"
                || key === "where_"
                || key === "templateWhere_"
                || key === "isArray_"
            ) return target[key]
            else if (key === "raw_") return target
            else if (key === proxyType) return 'relationalWhereProxy'
            else return findPropOnTemplateWhereProxy(target, key, classWiki)
        }
    })
    return proxy
}

export function findPropOnTemplateWhereProxy(mapObj, key, classWiki) {
    if (mapObj.uncalledJunctions_[key]) {
        const relation = mapObj.uncalledJunctions_[key]
        const formattedRelationObj = classWiki2ScopeObj(relation)
        removeRelationFromUnusedRelations(mapObj, key)
        const proxyRelations = mapObj.junctions_ ??= {}
        proxyRelations[key] = createTemplateWhereProxy(formattedRelationObj, classWiki.junctions[key])
        return proxyRelations[key]
    }
    else if (mapObj.columns_[key]) return mapObj.columns_[key]
    else if (mapObj.junctions_[key]) return mapObj.junctions_[key]
    else if (mapObj.parent_) return findPropOnTemplateWhereProxy(mapObj.parent_, key, classWiki.parent)
    else throw new Error(`\n'${key}' is not a valid property of class ${classWiki.className}. Please fix the find function's templateWhere. \nhint: use intellisense by pressing CNTRL + space to see all viable options.`)
}