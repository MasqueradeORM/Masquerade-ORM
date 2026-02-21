// Copyright 2026 B.G (github.com/MasqueradeORM)
// SPDX-License-Identifier: Apache-2.0

import { OrmStore } from "../../misc/ormStore.js"
import { DependentsFinalizationRegistry, ORM } from "../../ORM/ORM.js"
import { executeFindQuery, parseFindWiki } from "../find/find.js"
import { createStatementsDict, queryBuilder } from "../find/queryBuilder.js"
import { deproxifyScopeProxy, classWiki2ScopeProxy } from "../find/scopeProxies.js"
import { postgresCreateProxyArray } from "../find/sqlClients/postgresFuncs.js"
import { sqliteCreateProxyArray } from "../find/sqlClients/sqliteFuncs.js"

export async function internalFind(dependentWiki, relationalProps, searchedId) {
    const { sqlClient, dbConnection, entities } = OrmStore.store
    const baseProxyMap = classWiki2ScopeProxy({ ...dependentWiki })
    let findWiki = deproxifyScopeProxy(baseProxyMap)
    const eagerLoadObj = {}
    for (const prop of relationalProps) internalFindSetup(prop, findWiki, eagerLoadObj, searchedId)

    const [aliasedFindWiki, joinStatements, whereOutput, orderByOutput] = parseFindWiki(findWiki)
    const statementsObj = createStatementsDict(whereOutput, orderByOutput, undefined, undefined, sqlClient)
    let [queryString, eagerLoadWiki] = queryBuilder(aliasedFindWiki, joinStatements, statementsObj, eagerLoadObj, dependentWiki, sqlClient)
    queryString = queryString.replace(/\bAND\b/g, `OR`)
    const queryResult = await executeFindQuery(queryString, statementsObj.params, dbConnection, sqlClient)
    const instanceArr = sqlClient === "postgres" ?
        postgresCreateProxyArray(queryResult, eagerLoadWiki, entities, eagerLoadObj) :
        sqliteCreateProxyArray(queryResult, eagerLoadWiki, entities, true)

    return instanceArr
}


export function insertDependentsData(className, dependedOnId, dependentsData, dependentsMapsObj) {
    const map = dependentsMapsObj[className] ??= new Map()
    map.set(dependedOnId, new WeakRef(dependentsData))
    ORM[DependentsFinalizationRegistry].register(dependentsData, [className, dependedOnId])
}



export function internalFindSetup(prop, findWiki, eagerLoadObj, searchedId) {
    const { [prop]: relation, ...restOfRelations } = findWiki.uncalledJunctions_
    const relationCopy = { ...relation }
    relationCopy.where = { id: searchedId }
    for (const key of Object.keys(relationCopy)) {
        relationCopy[key + `_`] = relationCopy[key]
        delete relationCopy[key]
    }
    const { junctions_, ...noJunctionsRelation } = relationCopy
    findWiki.uncalledJunctions_ = restOfRelations
    findWiki.junctions_ ??= {}
    findWiki.junctions_[prop] = noJunctionsRelation
    eagerLoadObj[prop] = true
}