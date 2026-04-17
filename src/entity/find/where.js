// Copyright 2026 B.G (github.com/MasqueradeORM)
// SPDX-License-Identifier: Apache-2.0

import { Alias, aliasSymb, SqlTemplateObj } from "../../misc/classes.js"
import { array2String, getType } from "../../misc/miscFunctions.js"
import { OrmStore } from "../../misc/ormStore.js"
import { removeRelationFromUnusedRelations } from "./find.js"
import { classWiki2ScopeProxy } from "./scopeProxies.js"
import { mergeTemplateScope, templateFuncs2Statements } from "./templateProxies.js"
/**@typedef {import('../../misc/classes.js').OrArray} OrArray */


export function whereValues2Statements(mapObj, whereValuesObj, whereOutputDict) {
    for (const key of Object.keys(whereValuesObj)) {
        const whereValue = whereValuesObj[key]
        validateWhereValue(whereValue, key, mapObj.columns[key])
        whereValue2Statement(whereValue, key, mapObj, whereOutputDict)
    }
}

function validateWhereValue(whereValue, propertyName, /**@type {object}*/ propertyTypeObj) {
    const columnType = propertyTypeObj.type
    const columnIsArray = propertyTypeObj.isArray || false
    const valueType = getType(whereValue)
    let propertyType = columnType

    if (valueType === "OR") validateAndOrInputs(whereValue, propertyName, propertyType)

    else if (valueType === "SqlTemplateObj") validateSqlObjectParams(whereValue, propertyName)

    else if (valueType === "function") validateSqlArrowFn(whereValue, propertyName)

    else if (valueType === "array") {
        if (!columnIsArray) throw new Error(`\nThe 'where' argument ${array2String(whereValue)} is invalid - expected argument of type ${columnType} | Raw |  OR | undefined | null.`)
        else {
            const validTypes = [propertyType, "null", "undefined"]
            for (let i = 0; i < whereValue.length; i++) {
                const el = whereValue[i]
                const elType = getType(el)
                if (!validTypes.includes(elType)) throw new Error(`\nThe 'where' argument ${array2String(whereValue)} is invalid due to containing an element of type ${elType} - expected elements of type ${columnType} | undefined | null.`)
                if (!(i in whereValue)) throw new Error(`${whereValue} has a hole at index ${i}.`)
            }
        }
    }
    else {
        const validTypes = [propertyType, "null", "undefined"]
        if (!validTypes.includes(valueType)) {
            throw new Error(
                `\n'${whereValue}' is of type ${valueType} but should be of type ${columnType} | null | undefined. The invalid argument is located in the 'where' field of property '${propertyName}'.`
            )
        }
    }
}

function validateAndOrInputs(/**@type {OrArray}*/ orArr, /**@type {string}*/ propertyName, /**@type {any}*/ propertyType) {
    const AndOrValue = orArr[0]
    for (const elementVal of AndOrValue) {
        const valueType = getType(elementVal)
        if (valueType === "SqlTemplateObj") throw new Error(`\nThe OR function does not support 'sql' template functions.`)
        else if (valueType === "OR") validateAndOrInputs(elementVal, propertyName, propertyType)
        else if (valueType === "array") {
            //@ts-ignore
            if (propertyType.isArray) validateArrayElementsType(elementVal, propertyType.type, ['null', 'undefined'])
            else throw new Error(`\n'${elementVal}' of type ${valueType} is invalid as an argument for 'OR' functions of the property '${propertyName}', which expects values of type ${propertyType.type} | null | undefined | SqlTemplateObj | OR.`)
        }
        else {
            //@ts-ignore
            const validTypes = propertyType.isArray ? ["undefined", "null"] : [propertyType.type, "undefined", "null"]
            if (!validTypes.includes(valueType)) throw new Error(`\n'${elementVal}' of type ${valueType} is invalid as an argument for 'OR' functions of the property '${propertyName}', which expects values of type ${array2String(validTypes, true)} | SqlTemplateObj | OR.`)
        }
    }
}

function validateArrayElementsType(/**@type {any[]}*/ array, /**@type {string}*/ type, additionalValidTypes = []) {
    const validTypes = [type, ...additionalValidTypes]
    for (let i = 0; i < array.length; i++) {
        if (!(i in array)) throw new Error(`${array2String(array)} has a hole at index ${i}.`)
        const el = array[i]
        const elType = getType(el)
        if (!validTypes.includes(elType)) throw new Error(`\nThe value ${el} inside the array ${array2String(array)} is of type ${elType} but needs to be of type ${type} | null | undefined.`)
    }
}

function validateSqlObjectParams(SqlTemplateObj, propertyName, whereValueFunc = null) {
    const { __strings__: strings, __params__: params } = SqlTemplateObj
    if (params.length === 0) return

    if (whereValueFunc) {
        let hasPoundsign = false
        hasPoundsign = strings.some(str => str.includes("#"))
        if (hasPoundsign) throw new Error(`\nInvalid input in the 'where' field - the value of property ${propertyName} ( ${whereValueFunc} ) should not contain any #'s in the psuedo-query-string. \nWhen passing this property a function, only use a template literal of the function's argument as a placeholder. \nEXAMPLE: (a) => sql'\${a} < val1 OR \${a} > val2'.`)

        let valueParams = 0
        let placeholderParams = 0
        params.forEach((param) => param instanceof Alias ? placeholderParams++ : valueParams++)
        if (placeholderParams !== valueParams) throw new Error(
            `\nInvalid input in the 'where' field - the value of property ${propertyName} is an 'sql' function ( ${whereValueFunc} ) that expected an equal number of template literals of the alias argument and of template literals of values, but instead got ${placeholderParams} of the former and ${valueParams} of the latter.`
        )
    }

    for (const param of params) {
        const paramType = getType(param)
        if (paramType === "array") {
            for (let i = 0; i < param.length; i++) {
                if (!(i in param)) throw new Error(`${array2String(param)} has a hole at index ${i}.`)
            }
        }
    }
}

function validateSqlArrowFn(sqlFunc, propertyName) {
    const SqlTemplateObj = sqlFunc(new Alias(propertyName))
    if (!(SqlTemplateObj instanceof SqlTemplateObj)) throw new Error(`\nInvalid input in the 'where' field, ${sqlFunc} of property '${propertyName}' is not valid, as the function does not return an object of type SqlTemplateObj.`)
    validateSqlObjectParams(SqlTemplateObj, propertyName, sqlFunc)
}


function whereValue2Statement(whereValue, propertyName, aliasObj, whereOutputDict) {
    const whereValueType = getType(whereValue)
    let queryStr = ``
    const columnIdentity = Alias.createColumnId(aliasObj, propertyName)

    if (whereValueType === "OR") {
        queryStr += or2Statement(whereValue, columnIdentity, whereOutputDict)
    }
    else if (whereValueType === "SqlTemplateObj") {
        queryStr += SqlTemplateObj2Statement(whereValue, columnIdentity, whereOutputDict)
    }
    else if (whereValueType === "function") {
        queryStr += nonRelationalWhereFunction2Statement(whereValue, columnIdentity, whereOutputDict)
    }
    else {
        //primitive values
        if (whereValueType === 'object') {
            JSONValAccessor(columnIdentity, whereValue, whereOutputDict)
            return
        }
        else if (whereValueType === 'array') whereValue = whereValue.filter(() => true)
        const paramIndex = whereOutputDict.params.length + 1
        queryStr += `${columnIdentity} = $${paramIndex}`
        whereOutputDict.params.push(whereValue)
    }

    queryStr = queryStr.trim() //.replaceAll("  ", " ")
    whereOutputDict.statements.push(queryStr)
}

function JSONValAccessor(columnIdentity, objVal, whereOutputDict) {
    const { sqlClient } = OrmStore.store
    // @ts-ignore
    const stringValPairs = fieldPathAndVal(objVal)
    const orHandler = (valIdentifier, vals, whereOutputDict, root = false) => {
        const strings = []
        let paramIndex = whereOutputDict.params.length + 1
        for (const el of vals) {
            const valueType = getType(el)
            if (valueType === "SqlTemplateObj") throw new Error(`\nThe 'OR' function does not support 'sql' template functions.`)
            else if (valueType === "OR") strings.push(orHandler(valIdentifier, el, whereOutputDict))
            else {
                strings.push(`${valIdentifier} = $${paramIndex++}`)
                whereOutputDict.params.push(el)
            }
        }
        if (root) whereOutputDict.statements.push(strings.join(` OR `))
        else return strings.join(` OR `)
    }
    const handler = sqlClient === 'sqlite'
        ? (path, val) => {
            const valIdentifier = `json_extract(${columnIdentity}, '$${path}')`
            const valType = getType(val)
            if (valType === 'SqlTemplateObj')
                whereOutputDict.statements.push(SqlTemplateObj2Statement(val, valIdentifier, whereOutputDict))
            else if (valType === 'OR') orHandler(valIdentifier, val[0], whereOutputDict, true)
            else {
                whereOutputDict.statements.push(valIdentifier + ` = ?`)
                whereOutputDict.params.push(val)
            }
        }
        : (path, val) => {
            let postgresPath = ''
            path = path.slice(1)
            const loopArr = path.split('.')
            const valField = loopArr.pop()
            for (const field of loopArr) {
                postgresPath += `->'${field}'`
            }
            postgresPath += `->>'${valField}'`
            const valIdentifier = `${columnIdentity}${postgresPath}`
            const valType = getType(val)
            if (valType === 'SqlTemplateObj')
                whereOutputDict.statements.push(SqlTemplateObj2Statement(val, valIdentifier, whereOutputDict))
            else if (valType === 'OR') orHandler(valIdentifier, val[0], whereOutputDict, true)
            else {
                let paramIndex = whereOutputDict.params.length + 1
                whereOutputDict.statements.push(valIdentifier + ` = $${paramIndex}`)
                whereOutputDict.params.push(val)
            }
        }
    for (const [path, val] of stringValPairs) handler(path, val)
    // `#->'preferences'->>'theme' = 'dark'`
    // `json_extract(#, '$.preferences.theme') = 'dark'`
}

function fieldPathAndVal(obj, fieldStr = '', stringValPairs = []) {
    for (const [key, value] of Object.entries(obj)) {
        const keyFieldStr = `${fieldStr}.${key}`
        const valType = getType(value)
        if (valType === 'object') {

            fieldPathAndVal(value, keyFieldStr, stringValPairs)
        }
        else stringValPairs.push([keyFieldStr, value])
    }
    return stringValPairs
}

function or2Statement(whereValue, columnIdentity, whereOutputDict) {
    let queryStr = ``
    let paramIndex
    whereValue.forEach((el, index) => {
        paramIndex = whereOutputDict.params.length + 1
        if (index !== 0) queryStr += ` OR`
        const elType = getType(el)
        if (elType === "OR") queryStr += or2Statement(el, columnIdentity, whereOutputDict)
        
        // else if (elType === "SqlTemplateObj") {
        //     throw new Error(`\nOR/AND do not support 'sql' template functions.`)
        //     //queryStr += SqlTemplateObj2Statement(el, columnIdentity, whereOutputDict)
        // }
        else {
            queryStr += ` ${columnIdentity} = $${paramIndex}`
            whereOutputDict.params.push(el)
        }
    })
    return `(${queryStr.trim()})`
}

export function SqlTemplateObj2Statement(SqlTemplateObj, columnIdentity, whereOutputDict) {
    let queryStr = ``
    let paramIndex = whereOutputDict.params.length + 1
    let hasPoundsign = false
    const { __strings__: strings, __params__: params } = SqlTemplateObj
    hasPoundsign = strings.some(str => str.includes("#"))
    if (!hasPoundsign) queryStr += `# `
    while (strings.length + params.length > 0) {
        if (strings.length) queryStr += strings.shift()
        if (params.length) {
            whereOutputDict.params.push(params.shift())
            queryStr += `$${paramIndex++}`
        }
    }
    queryStr = queryStr.replaceAll("#", columnIdentity)
    return queryStr
}

function nonRelationalWhereFunction2Statement(func, columnIdentity, whereOutputDict) {
    let queryStr = ``
    let paramIndex = whereOutputDict.params.length + 1
    const SqlTemplateObj = func(new Alias(columnIdentity))
    const { __strings__: strings, __params__: params } = SqlTemplateObj
    while (strings.length + params.length > 0) {
        if (strings.length) queryStr += strings.shift()
        if (params.length) {
            const param = params.shift()
            if (param instanceof Alias) queryStr += param[aliasSymb]
            else {
                queryStr += `$${paramIndex++}`
                whereOutputDict.params.push(param)
            }
        }
    }
    return `(${queryStr.trim()})`
}


export function mergeWhereScope(scopeProxy, whereObj) {
    const classWikiDict = OrmStore.store.classWikiDict
    for (const [key, whereVal] of Object.entries(whereObj)) {

        if (key === "$templateWhere") {
            scopeProxy = mergeTemplateScope(scopeProxy, whereVal, "templateWhere")
            continue
        }

        const [value, classProxy4Key, keyCategory] = scopeProxy[key]
        if (keyCategory === "columns_") {
            if (whereVal === null) continue
            classProxy4Key.where_ ??= {}
            classProxy4Key.where_[key] = whereVal
        }
        else if (keyCategory === "uncalledJunctions_" || keyCategory === "junctions_") {
            const whereValType = getType(whereVal)
            if (whereValType !== "function" && whereValType !== "object")
                throw new Error(
                    `\nThe 'where' field of the 'find' function's argument must be an object whose relational properties have values of: 
            • another object
            • a single function`
                )

            if (keyCategory === "uncalledJunctions_") {
                removeRelationFromUnusedRelations(classProxy4Key, key)
                classProxy4Key.junctions_ ??= {}
                classProxy4Key.junctions_[key] = classWiki2ScopeProxy(classWikiDict[value.className])
            }

            const passedScopeProxy = classProxy4Key.junctions_[key]
            if (whereValType === "function") passedScopeProxy.templateWhere_ = whereVal
            else mergeWhereScope(passedScopeProxy, whereVal)
        }
    }
}


export function parseTemplateWhere(templateWhere, templateAliasObj, whereDict) {
    const { statement, params } = templateFuncs2Statements(templateWhere, templateAliasObj, whereDict.params.length + 1)
    whereDict.statements.push(statement)
    whereDict.params.push(...params)
}
