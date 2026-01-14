import { proxyType } from "./find.js"

export function classWiki2ScopeObj(classWiki) {
    const scopeProxy = {
        className_: classWiki.className ?? classWiki.className_,
        columns_: classWiki.columns ?? classWiki.columns_,
        uncalledJunctions_: classWiki.junctions ?? classWiki.junctions_,
    }
    if (classWiki.isArray || classWiki.isArray_) scopeProxy.isArray_ = true
    return scopeProxy
}

export function deproxifyScopeProxy(scopeProxy, fixPropertyNames = false) {
    scopeProxy = scopeProxy.raw_
    if (scopeProxy.parent_) scopeProxy.parent_ = deproxifyScopeProxy(scopeProxy.parent_, fixPropertyNames)

    if (scopeProxy.junctions_) {
        for (const key of Object.keys(scopeProxy.junctions_))
            scopeProxy.junctions_[key] = deproxifyScopeProxy(scopeProxy.junctions_[key], fixPropertyNames)
    }

    if (fixPropertyNames) {
        const fixedMap = {}
        for (const property of Object.keys(scopeProxy)) fixedMap[property.slice(0, -1)] = scopeProxy[property]
        return fixedMap
    }
    return scopeProxy
}

export function classWiki2ScopeProxy(classWiki) {
    const scopeObj = classWiki2ScopeObj(classWiki)
    if (classWiki.parent) scopeObj.parent_ = classWiki2ScopeProxy(classWiki.parent)

    const proxy = new Proxy(scopeObj, {
        get: (target, key, reciever) => {
            if (
                key === "className_"
                || key === "parent_"
                || key === "columns_"
                || key === "uncalledJunctions_"
                || key === "junctions_"
                || key === "where_"
                || key === "relationalWhere_"
                || key === "isArray_"
            ) return target[key]
            else if (key === proxyType) return 'categorizingProxy'
            else if (key === "raw_") return target
            else return findPropOnScopeProxy(target, key, classWiki.className)
        },
    })
    return proxy
}

export function findPropOnScopeProxy(scopeProxy, key, rootClassName) {
    if (scopeProxy.columns_[key]) return [scopeProxy.columns_[key], scopeProxy, "columns_"]
    else if (scopeProxy.uncalledJunctions_ && scopeProxy.uncalledJunctions_[key]) return [scopeProxy.uncalledJunctions_[key], scopeProxy, "uncalledJunctions_"]
    else if (scopeProxy.junctions_ && scopeProxy.junctions_[key]) return [scopeProxy.junctions_[key], scopeProxy, "junctions_"]
    else if (scopeProxy.parent_) return findPropOnScopeProxy(scopeProxy.parent_, key, rootClassName)
    else throw new Error(`\n'${key}' is not a valid property of class ${rootClassName}. Please fix the find function's argument. \nhint: use intellisense by pressing CNTRL + space to see all viable options.`)
}