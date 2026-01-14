import { OrmStore } from "../../misc/ormStore.js"
import { DependentsFinalizationRegistry, ORM } from "../../ORM/ORM.js"
import { aliasedFindWiki2QueryRes, parseFindWiki } from "../find/find.js"
import { deproxifyScopeProxy, classWiki2ScopeProxy } from "../find/scopeProxies.js"
import { postgresCreateProxyArray } from "../find/sqlClients/postgresFuncs.js"
import { sqliteCreateProxyArray } from "../find/sqlClients/sqliteFuncs.js"

export async function internalFind(dependentMap, relationalProps, searchedId) {
    const { sqlClient, dbConnection, entities } = OrmStore.store
    const baseProxyMap = classWiki2ScopeProxy({ ...dependentMap })
    let findWiki = deproxifyScopeProxy(baseProxyMap)
    const eagerLoadObj = {}
    for (const prop of relationalProps) internalFindSetup(prop, findWiki, eagerLoadObj, searchedId)

    const [aliasedFindMap, joinStatements, whereObj] = parseFindWiki(findWiki)
    const [queryResult, eagerLoadMap] = await aliasedFindWiki2QueryRes(aliasedFindMap, joinStatements, whereObj, eagerLoadObj, dependentMap, dbConnection, true)
    const instanceArr = sqlClient === "postgresql" ?
        postgresCreateProxyArray(queryResult, eagerLoadMap, entities, eagerLoadObj) :
        sqliteCreateProxyArray(queryResult, eagerLoadMap, entities, true)

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