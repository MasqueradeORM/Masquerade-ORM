
import { Alias, aliasSymb, SqlWhereObj } from "../../../misc/classes.js"
import { array2String, getType, nonSnake2Snake } from "../../../misc/miscFunctions.js"
import { OrmStore } from "../../../misc/ormStore.js"
import { removeRelationFromUnusedRelations } from "../find.js"
import { classWiki2ScopeProxy } from "../scopeProxies.js"
import { mergeRelationalWhereScope } from "./relationalWhere.js"
/**@typedef {import('../../../misc/classes').AndArray} AndArray */
/**@typedef {import('../../../misc/classes').AndArray} OrArray */


export function whereValues2Statements(mapObj, whereObj) {
    const whereValuesObj = mapObj.where
    for (const key of Object.keys(whereValuesObj)) {
        const whereValue = whereValuesObj[key]
        validateWhereValue(whereValue, key, mapObj.columns[key])
        whereValue2Statement(whereValue, key, mapObj, whereObj)
    }
}

function validateWhereValue(whereValue, propertyName, /**@type {object}*/ propertyTypeObj) {
    const columnType = propertyTypeObj.type
    const columnIsArray = propertyTypeObj.isArray || false
    const valueType = getType(whereValue)
    let propertyType = columnType

    if (valueType === "AND" || valueType === "OR") validateAndOrInputs(whereValue, propertyName, propertyType)

    else if (valueType === "SqlWhereObj") validateSqlObjectParams(whereValue, propertyName)

    else if (valueType === "function") validateSqlArrowFn(whereValue, propertyName)

    else if (valueType === "array") {
        if (!columnIsArray) throw new Error(`\nThe 'where' argument ${array2String(whereValue)} is invalid - expected argument of type ${columnType} | Raw |  OR | AND | undefined | null.`)
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

function validateAndOrInputs(/**@type {AndArray | OrArray}*/ AndOr, /**@type {string}*/ propertyName, /**@type {any}*/ propertyType) {
    const AndOrValue = AndOr[0]
    for (const elementVal of AndOrValue) {
        const valueType = getType(elementVal)
        if (valueType === "SqlWhereObj") validateSqlObjectParams(elementVal, propertyName)
        else if (valueType === "AND" || valueType === "OR") validateAndOrInputs(elementVal, propertyName, propertyType)
        else if (valueType === "array") {
            //@ts-ignore
            if (propertyType.isArray) validateArrayElementsType(elementVal, propertyType.type, ['null', 'undefined'])
            else throw new Error(`\n'${elementVal}' of type ${valueType} is invalid as an argument of 'AND'/'OR' functions for the property '${propertyName}', which expects values of type ${propertyType.type} | null | undefined | SqlWhereObj | AND | OR.`)
        }
        else {
            //@ts-ignore
            const validTypes = propertyType.isArray ? ["undefined", "null"] : [propertyType.type, "undefined", "null"]
            if (!validTypes.includes(valueType)) throw new Error(`\n'${elementVal}' of type ${valueType} is invalid as an argument of 'AND'/'OR' functions for the property '${propertyName}', which expects values of type ${array2String(validTypes, true)} | SqlWhereObj | AND | OR.`)
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

function validateSqlObjectParams(sqlObj, propertyName, whereValueFunc = null) {
    if (sqlObj.params.length === 0) return

    if (whereValueFunc) {
        let hasPoundsign = false
        hasPoundsign = sqlObj.strings.some(str => str.includes("#"))
        if (hasPoundsign) throw new Error(`\nInvalid input in the 'where' field - the value of property ${propertyName} ( ${whereValueFunc} ) should not contain any #'s in the psuedo-query-string. \nWhen passing this property a function, only use a template literal of the function's argument as a placeholder. \nEXAMPLE: (a) => sql'\${a} < val1 OR \${a} > val2'.`)

        let valueParams = 0
        let placeholderParams = 0
        sqlObj.params.forEach((param) => param instanceof Alias ? placeholderParams++ : valueParams++)
        if (placeholderParams !== valueParams) throw new Error(
            `\nInvalid input in the 'where' field - the value of property ${propertyName} is an 'sql' function ( ${whereValueFunc} ) that expected an equal number of template literals of the alias argument and of template literals of values, but instead got ${placeholderParams} of the former and ${valueParams} of the latter.`
        )
    }

    for (const param of sqlObj.params) {
        const paramType = getType(param)
        if (paramType === "array") {
            for (let i = 0; i < param.length; i++) {
                if (!(i in param)) throw new Error(`${array2String(param)} has a hole at index ${i}.`)
            }
        }
    }
}

function validateSqlArrowFn(sqlFunc, propertyName) {
    const sqlWhereObj = sqlFunc(new Alias(propertyName))
    if (!(sqlWhereObj instanceof SqlWhereObj)) throw new Error(`\nInvalid input in the 'where' field, ${sqlFunc} of property ${propertyName} is not valid, the only valid function argument is the tagged template literal function sql. \nE.g. sql'> \${val}' | sql'# > \${val1} AND # < \${val2}' - for more advanced examples refer to documentation.`)
    validateSqlObjectParams(sqlWhereObj, propertyName, sqlFunc)
}


function whereValue2Statement(whereValue, propertyName, aliasObj, whereObj) {
    const whereValueType = getType(whereValue)
    let queryStr = ``
    const columnIdentity = aliasObj.alias + `.${nonSnake2Snake(propertyName)}`

    if (whereValueType === "AND" || whereValueType === "OR") {
        queryStr += andOr2Statement(whereValue, whereValueType, columnIdentity, whereObj)
    }
    else if (whereValueType === "SqlWhereObj") {
        queryStr += sqlWhereObj2Statement(whereValue, columnIdentity, whereObj)
    }
    else if (whereValueType === "function") {
        queryStr += nonRelationalWhereFunction2Statement(whereValue, columnIdentity, whereObj)
    }
    else {
        //primitive values
        if (Array.isArray(whereValue)) whereValue = whereValue.filter(() => true)
        let paramIndex = whereObj.params.length + 1
        queryStr += `${columnIdentity} = $${paramIndex}`
        whereObj.params.push(whereValue)
    }

    queryStr = queryStr.trim().replaceAll("  ", " ")
    whereObj.statements.push(queryStr)
}

function andOr2Statement(whereValue, whereValueType, columnIdentity, whereObj) {
    let queryStr = ``
    let paramIndex
    whereValue.forEach((el, index) => {
        paramIndex = whereObj.params.length + 1
        if (index !== 0) queryStr += whereValueType === "AND" ? ` AND` : ` OR`
        const elType = getType(el)

        if (elType === "AND" || elType === "OR") {
            queryStr += andOr2Statement(el, elType, columnIdentity, whereObj)
        }
        else if (elType === "SqlWhereObj") {
            queryStr += ` ` + sqlWhereObj2Statement(el, columnIdentity, whereObj)
        }
        else {
            queryStr += ` ${columnIdentity} = $${paramIndex}`
            whereObj.params.push(el)
        }
    })
    queryStr = queryStr.trim().replace("  ", " ")
    queryStr = `(` + queryStr + `)`
    return queryStr
}

function sqlWhereObj2Statement(sqlWhereObj, columnIdentity, whereObj) {
    let queryStr = ``
    let paramIndex = whereObj.params.length + 1
    let hasPoundsign = false
    hasPoundsign = sqlWhereObj.strings.some(str => str.includes("#"))
    if (!hasPoundsign) queryStr += `# `

    while (sqlWhereObj.strings.length + sqlWhereObj.params.length > 0) {
        if (sqlWhereObj.strings.length) queryStr += ` ` + sqlWhereObj.strings.shift()
        if (sqlWhereObj.params.length) {
            whereObj.params.push(sqlWhereObj.params.shift())
            queryStr += ` $${paramIndex++}`
        }
    }
    queryStr = queryStr.replaceAll("#", columnIdentity)
    return queryStr
}

function nonRelationalWhereFunction2Statement(func, columnIdentity, whereObj) {
    let queryStr = ``
    const sqlWhereObj = func(new Alias(columnIdentity))
    while (sqlWhereObj.params.length + sqlWhereObj.strings.length > 0) {
        let paramIndex = whereObj.params.length + 1

        sqlWhereObj.strings.length && (queryStr += ` ` + sqlWhereObj.strings.shift())
        if (sqlWhereObj.params.length) {
            const param = sqlWhereObj.params.shift()
            if (param instanceof Alias) queryStr += ` ` + param[aliasSymb]
            else {
                queryStr += ` $${paramIndex}`
                whereObj.params.push(param)
            }
        }
    }
    queryStr = `(` + queryStr.trim() + `)`
    return queryStr
}


export function mergeWhereScope(proxyMap, whereObj) {
    const entries = Object.entries(whereObj)
    const classWikiDict = OrmStore.store.classWikiDict
    for (const [key, whereVal] of entries) {

        if (key === "_relationalWhere") {
            proxyMap = mergeRelationalWhereScope(proxyMap, whereVal)
            continue
        }

        const [value, classMap, keyCategory] = proxyMap[key]
        if (keyCategory === "columns_") {
            classMap.where_ ??= {}
            classMap.where_[key] = whereVal
        }
        else if (keyCategory === "uncalledJunctions_" || keyCategory === "junctions_") {

            const whereValType = getType(whereVal)
            if (whereValType !== "function" && whereValType !== "array" && whereValType !== "object")
                throw new Error(
                    `\nThe 'where' field of the find function's argument must be an object where relational fields have values of: 
            • another object
            • a single function
            • an array of functions`
                )

            if (keyCategory === "uncalledJunctions_") {
                removeRelationFromUnusedRelations(classMap, key)
                classMap.junctions_ ??= {}
                classMap.junctions_[key] = classWiki2ScopeProxy(classWikiDict[value.className])
            }

            const passedMap = classMap.junctions_[key]
            if (whereValType === "function") passedMap.relationalWhere_ = [whereVal]
            else if (whereValType === "array") passedMap.relationalWhere_ = whereVal
            else mergeWhereScope(passedMap, whereVal)
        }
    }
}
