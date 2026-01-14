import { Alias, aliasSymb, AndArray, OrArray, SqlWhereObj } from './classes.js';
import { floatColumnTypes, js2db } from './constants.js';

export function nonSnake2Snake(/**@type {string}*/ str) {
    if (str.at(0) === str.at(0)?.toUpperCase()) {
        str = str[0].toLowerCase() + str.slice(1)
    }
    return str
        .replace(/([A-Z])/g, (match, p1, offset) => {
            // Don't prepend underscore if it's the first letter
            return offset === 0 ? p1 : `_${p1}`
        })
        .toLowerCase()
}

export function snake2Pascal(str, camelCase = false) {
    if (camelCase) return str
        .replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())

    return str
        .replace(/_([a-z])/g, (_, letter) => letter.toUpperCase()) // camelCase
        .replace(/^([a-z])/, (_, first) => first.toUpperCase());   // capitalize first letter
}


export function postgres2sqliteQueryStr(queryString) {
    return queryString.replace(/\$\d+/g, '?')
}

export function js2SqlTyping(sqlClient, /**@type {string | undefined}*/ type = undefined, isId = false) {
    if (!type) return js2db[sqlClient]
    const returnedType = js2db[sqlClient][type]
    if (isId && floatColumnTypes.includes(returnedType)) return 'INTEGER'
    return returnedType
}


export function postgres2JsTyping(value, columnTypeObj) {
    if (value === null || value === undefined) return undefined
    const type = columnTypeObj.type
    if (type === 'bigint') return BigInt(value)
    else return value
}

export function sqlite2JsTyping(value, columnTypeObj) {
    if (value === null || value === undefined ) return undefined
    const type = columnTypeObj.type
    if (columnTypeObj.isArray || type === 'object' || type === 'OrmJSON') return JSON.parse(value)
    else if (type === 'bigint') return BigInt(value)
    else if (type === 'boolean') return value === 1
    else if (type === 'Date') return new Date(value)
    else return value
}

export function getType(val) {
    if (val === null) return "null"
    if (val instanceof OrArray) return "OR"
    if (val instanceof AndArray) return "AND"
    if (val instanceof SqlWhereObj) return "SqlWhereObj"
    if (val instanceof Alias) return "Alias"
    if (val instanceof Date) return "Date"
    if (Array.isArray(val)) return "array"
    const t = typeof val
    return t
}

export function array2String(arr, displayingTypes = false) {
    let str = displayingTypes ? `` : `[`
    str += arr
        .map(el => {
            if (typeof el === "function") return "<function>"
            if (el === null) return "null"
            if (el === undefined) return "undefined"
            if (Array.isArray(el)) return array2String(el)
            if (el instanceof Alias) return el[aliasSymb] + `Alias`
            if (typeof el === "object") return JSON.stringify(el)
            return String(el)
        })
        .join(displayingTypes ? " | " : ", ")
    str += displayingTypes ? `` : `]`
    return str
}

export function jsValue2SqliteValue(param) {
    if (param === undefined) return null
    else {
        const paramType = getType(param)
        if (paramType === "boolean") return param ? 1 : 0
        else if (paramType === "array" || paramType === "object") return JSON.stringify(param)
        else if (paramType === "Date") return param.toISOString()
        else if (paramType === "bigint" || paramType === "function") return param.toString()
        else return param
    }
}

/**@typedef {import('./types.js').ConsoleLogType} ConsoleLogType */
export function coloredBackgroundConsoleLog(msg, /**@type {ConsoleLogType}*/ loggingType) {
    let colorCode
    if (loggingType === "success") colorCode = `#00ca79ff`
    else if (loggingType === "failure") colorCode = `#ca0000ff`
    else colorCode = `#c99d00ff`

    let loggingConfigStr = `color: white; background-color: ${colorCode}; font-size: 16px; font-weight: bold; padding: 10px; border-radius: 5px;`
    console.log(`%c${msg}`, loggingConfigStr)
}

export function getValidTypedArray(/**@type {any[]}*/ array, /**@type {string}*/ expectedType, /**@type {boolean}*/ isRelational) {
    const returnedArr = []
    if (isRelational) {
        const idDict = {}
        for (let i = 0; i < array.length; i++) {
            if (!(i in array)) continue
            const el = array[i]
            if (!el) continue

            if (idDict[el.id]) {
                coloredBackgroundConsoleLog(`Provided relational array contains duplicate instance with id of ${el.id}. Duplicate removed.`, `warning`)
                continue
            }
            returnedArr.push(el)
            idDict[el.id] = true
        }
    }
    else {
        const expectedTypesArr = [expectedType, 'undefined']
        array = array.map(el => el ? el : undefined)
        for (let i = 0; i < array.length; i++) {
            if (!(i in array)) continue
            const el = array[i]
            const elType = getType(el)
            if (expectedTypesArr.includes(elType)) returnedArr.push(el)
        }
    }
    return returnedArr
}

export function getPropertyClassification(propertyName, classWiki, /**@type {null | string | function}*/ errorMsgOrFunction = null) {
    if (classWiki.columns && classWiki.columns[propertyName]) {
        // found on column
        return ["Primitive", classWiki.columns[propertyName], classWiki]
    }
    else if (classWiki.junctions && classWiki.junctions[propertyName]) {
        // found on junction
        return ["Join", classWiki.junctions[propertyName], classWiki]
    }
    else if (classWiki.parent) {
        let currentClass = classWiki
        while (currentClass.parent) {
            const parent = currentClass.parent
            if (parent.columns && parent.columns[propertyName]) {
                // found on parent's columns
                return ["ParentPrimitive", parent.columns[propertyName], parent]
            }
            else if (parent.junctions && parent.junctions[propertyName]) {
                //found on parent's junctions
                return ["ParentJoin", parent.junctions[propertyName], parent]
            }
            currentClass = currentClass.parent
        }
    }

    if (errorMsgOrFunction) {
        if (typeof errorMsgOrFunction === 'string') throw new Error(errorMsgOrFunction)
        else errorMsgOrFunction(propertyName, classWiki)
    }
    return ["undefined"]
}