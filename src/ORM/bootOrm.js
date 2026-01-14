
import { createSourceFile, SyntaxKind, ScriptKind, ScriptTarget } from "typescript"
import { js2SqlTyping, nonSnake2Snake, snake2Pascal, array2String, coloredBackgroundConsoleLog } from "../misc/miscFunctions.js"
import { dependenciesSymb, floatColumnTypes, referencesSymb } from "../misc/constants.js"
import { uuidv7 } from "uuidv7"
import { DbManager, DbManagerStore } from "./DbManager.js"
import { OrmStore } from "../misc/ormStore.js"
/**@typedef {import('../misc/types.js').TABLE} TABLE */
/**@typedef {import('../misc/types.js').DbPrimaryKey} DbPrimaryKey */


export async function compareAgainstDb(tablesDict) {
    const { dbConnection, sqlClient } = OrmStore.store
    let queryFunc
    let strFunc
    let dbTableNames
    if (sqlClient === `postgresql`) {
        queryFunc = dbConnection.query.bind(dbConnection)
        strFunc = (tableName) => `SELECT column_name
                              FROM information_schema.columns
                              WHERE table_schema = 'public'
                              AND table_name = '${tableName}';`

        dbTableNames = (await queryFunc(`SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public' ORDER BY tablename;`))
            .rows.map(rowObj => rowObj.tablename)
    }
    else {
        queryFunc = (sql) => {
            const stmt = dbConnection.prepare(sql)
            const rows = stmt.all()
            return rows.map(r => r.name)
        }
        strFunc = (tableName) => `SELECT name FROM pragma_table_info('${tableName}');`
        dbTableNames = dbConnection.prepare(`PRAGMA table_list;`).all()
            .filter(tableObj => tableObj.schema === `main` && tableObj.name !== `sqlite_schema`)
            .map(tableObj => tableObj.name)
    }

    for (const [tableName, tableObj] of Object.entries(tablesDict)) {
        const tableColumns = sqlClient === `postgresql`
            ? (await queryFunc(strFunc(tableName))).rows.map(rowObj => snake2Pascal(rowObj.column_name, true))
            : await queryFunc(strFunc(tableName)).map(tableName => snake2Pascal(tableName, true))

        const index = dbTableNames.findIndex(dbTableName => dbTableName === tableName)
        if (index === -1) {
            tableObj.alreadyExists = false
            continue
        }
        else {
            tableObj.alreadyExists = true
            dbTableNames.splice(index, 1)
        }

        const classColumns = Object.keys(tableObj.columns)
        const unusedColumns = tableColumns.filter(columnName => !classColumns.includes(columnName))
        const newColumns = classColumns.filter(columnName => !tableColumns.includes(columnName))

        if (newColumns.length) {   // newColumns includes not only new columns, but also properties corresponding to junction tables, that may or may not exist on db.
            for (const column of newColumns) {
                const columnObj = tableObj.columns[column]
                if (columnObj.relational) {
                    const junctionTableName = `${tableName}___${nonSnake2Snake(columnObj.name)}_jt`
                    const index = dbTableNames.findIndex(dbTableName => dbTableName === junctionTableName)
                    if (index !== -1) {
                        dbTableNames.splice(index, 1)
                        delete tableObj.columns[column]
                        continue
                    }
                }
                const newColumnsDict = tableObj.newColumns ??= {}
                newColumnsDict[column] = columnObj
                delete tableObj.columns[column]
            }
        }

        if (unusedColumns.length) {
            const className = snake2Pascal(tableName, true)
            const dropColumnsDict = DbManagerStore.dropColumnsDict
            dropColumnsDict[className] = unusedColumns
            const loggedArr = array2String(unusedColumns.map(columnName => nonSnake2Snake(columnName)))
            coloredBackgroundConsoleLog(`Warning: Unused columns found in table '${tableName}' (${className}): ${loggedArr}. Consider removing them manually or using DbManager\`s 'dropUnusedColumns' method.\n`, "warning")
        }
    }
    const unusedJunctions = dbTableNames.filter(tableName => tableName.includes(`___`) && tableName.endsWith(`_jt`))
    const unusedTables = dbTableNames.filter(tableName => !unusedJunctions.includes(tableName))
    if (unusedTables.length) {
        coloredBackgroundConsoleLog(`Warning: The following entity tables are unused: ${array2String(unusedTables)}. Consider removing them manually or using DbManager\`s 'dropUnusedTables' method.\n`, "warning")
        DbManagerStore.deleteTables = unusedTables
    }
    if (unusedJunctions.length) {
        coloredBackgroundConsoleLog(`Warning: The following junction tables are unused: ${array2String(unusedJunctions)}. Consider removing them manually or using DbManager\`s 'dropUnusedJunctions' method.\n`, "warning")
        DbManagerStore.deleteJunctions = unusedJunctions
    }
}


export async function getInitIdValues(tablesDict) {
    const ormStore = OrmStore.store
    const idLogger = ormStore.idLogger = {}
    const { dbConnection, sqlClient } = ormStore
    let queryFunc
    if (sqlClient === `postgresql`) queryFunc = dbConnection.query.bind(dbConnection)
    else queryFunc = (query) => dbConnection.prepare(query).all()

    const queryFuncWithTryCatch = async (query) => {
        try {
            return await queryFunc(query)
        }
        catch (e) { }
    }

    for (const [tableName, tableObj] of Object.entries(tablesDict)) {
        const idType = tableObj.columns.id.type
        if (idType === `string`) {
            idLogger[snake2Pascal(tableName)] = uuidv7
            continue
        }

        const queryStr = `SELECT id FROM ${tableName} ORDER BY id DESC LIMIT 1;`
        const res = await queryFuncWithTryCatch(queryStr)
        if (!res) {
            const idVal = idType === `number` ? 0 : 0n
            idLogger[snake2Pascal(tableName)] = idVal
            continue
        }
        let id = sqlClient === `postgresql` ? res.rows[0]?.id : res[0]?.id
        if (id) {
            id = idType === `number` ? parseInt(id, 10) : BigInt(id)
            idLogger[snake2Pascal(tableName)] = id
        }
        else {
            const idVal = idType === `number` ? 0 : 0n
            idLogger[snake2Pascal(tableName)] = idVal
        }
    }
}

export function nodeArr2ClassDict(nodeArr) {
    const classObjArr = filterNodesAndConvert2ClassObjects(nodeArr)
    let classArr = []
    const entityArr = classObjArr.map(classObj => snake2Pascal(classObj.name))
    for (const classObj of classObjArr) {
        fillClassObjColumns(classObj, entityArr)
        delete classObj.node
        classArr.push(classObj)
    }
    // classArr.push(returnEntityClassObj())
    classArr = classArr.map(classObj => [classObj.name, classObj])
    const classDict = Object.fromEntries(classArr)
    return classDict
}

export function returnEntityClassObj() {
    let { idTypeDefault } = OrmStore.store
    if (idTypeDefault === "UUID") idTypeDefault = "string"
    else if (idTypeDefault === "INT") idTypeDefault = "number"
    else if (idTypeDefault === "BIGINT") idTypeDefault = "bigint"
    else throw new Error(`\n'${idTypeDefault}' is not a valid primary type.`)

    const idColumn = { name: "id", type: idTypeDefault }
    const updatedAtColumn = { name: "updatedAt", type: "Date" }
    return { name: "entity", abstract: true, columns: [idColumn, updatedAtColumn] }
}

export function filterNodesAndConvert2ClassObjects(nodeArr) {
    const classObjArr = []
    let currentUnfilteredNodes = nodeArr
    let newUnfilteredNodes = []
    let currentValidParents = ['entity']
    let newValidParents = []
    let iteration = 0
    while (currentValidParents.length) {
        for (const node of currentUnfilteredNodes) {
            const parent = nonSnake2Snake(node.heritageClauses[0].types[0].expression.escapedText)
            if (currentValidParents.includes(parent) || newValidParents.includes(parent)) {
                const name = nonSnake2Snake(node.name.escapedText)
                newValidParents.push(name)
                const classObj = { name, parent, node, columns: [], abstract: false }
                if (node.modifiers) {
                    for (const modifier of node.modifiers)
                        if (modifier.kind == SyntaxKind.AbstractKeyword) classObj.abstract = true
                }
                classObjArr.push(classObj)
            }
            else newUnfilteredNodes.push(node)
        }
        currentValidParents = newValidParents
        newValidParents = []
        currentUnfilteredNodes = newUnfilteredNodes
        newUnfilteredNodes = []
        iteration++
    }
    return classObjArr
}

export function handleSpecialClassSettingsObj(nodeInitializer) {
    const specialSettingsObj = {}
    const keysNodes = nodeInitializer.properties ?? nodeInitializer.elements
    for (const keyNode of keysNodes) {
        const key = keyNode.name.escapedText
        const value = keyNode.initializer.text ?? handleSpecialClassSettingsObj(keyNode.initializer)
        specialSettingsObj[key] = value
    }
    return specialSettingsObj
}

export function parseTypeObjContext(/**@type {object | string}*/ typeObjOrString, columnObj, entityNamesArr, nonRelationalTypesArr, className, /**@type {string | undefined}*/ tagName, /**@type {string[] | undefined}*/ typeScriptInvalidTypeArr = undefined) {
    /**@type {string}*/ let typeName = typeof typeObjOrString === `string` ? typeObjOrString.trim() : typeObjOrString.getText().trim()
    if (typeName.endsWith(`[]`)) {
        typeName = typeName.slice(0, -2)
        columnObj.isArray = true

        if (typeName.startsWith(`(`) && typeName.endsWith(`)`)) {
            typeName = typeName.slice(1, -1)
            const separatedTypes = typeName.split(`|`)
            for (let type of separatedTypes) {
                type = type.trim()
                if (type === `undefined`) continue
                else mapType2ValidMainType(type, columnObj, className, nonRelationalTypesArr, entityNamesArr, tagName, typeScriptInvalidTypeArr)
            }
        }
        else mapType2ValidMainType(typeName, columnObj, className, nonRelationalTypesArr, entityNamesArr, tagName, typeScriptInvalidTypeArr)
    }
    else if (typeName === `undefined`) columnObj.nullable = true
    else if (typeName === `Unique`) columnObj.unique = true
    else mapType2ValidMainType(typeName, columnObj, className, nonRelationalTypesArr, entityNamesArr, tagName, typeScriptInvalidTypeArr)
}

export function mapType2ValidMainType(typeName, columnObj, className, nonRelationalTypesArr, entityNamesArr, tagName, typeScriptInvalidTypeArr) {
    if (nonRelationalTypesArr.includes(typeName)) assignColumnType(typeName, columnObj, className)
    else if (entityNamesArr.includes(typeName)) {
        columnObj.relational = true
        assignColumnType(typeName, columnObj, className)
    }
    else {
        if (tagName === `satisfies`) assignColumnType(`object`, columnObj, className)
        else {
            if (typeScriptInvalidTypeArr) typeScriptInvalidTypeArr.push(typeName)
            else {
                console.error(`\nInvalid typing error on property '${columnObj.name}' of class ${snake2Pascal(className)} - ${typeName} is not a valid main type.\n`
                    + `Valid main types are ${array2String([...nonRelationalTypesArr, ...entityNamesArr])}.`)
                process.exit(1)
            }
        }
    }
}

export function assignColumnType(type, columnObj, className) {
    if (columnObj.type) {
        console.error(`\nInvalid typing error on property '${columnObj.name}' of class ${snake2Pascal(className)} - cannot have two main types of ${type} and ${columnObj.type}.`)
        process.exit(1)
    }
    columnObj.type = type
}

export function fillClassObjColumns(classObj, entityNamesArr) {
    const classNodesArr = classObj.node.members.length ? classObj.node.members : []
    const nonRelationalTypesArr = [`number`, `integer`, `string`, `boolean`, `object`, `Date`, `bigint`]

    for (const node of classNodesArr) {
        if (node.kind == SyntaxKind.Constructor && node.jsDoc) {
            node.jsDoc[0].tags[0].tagName.escapedText === "abstract" && (classObj.abstract = true)
        }

        if (node.kind == SyntaxKind.PropertyDeclaration) {
            let propertyName
            /**@type {any}*/ let columnObj
            let isStatic = false

            if (node.modifiers) {
                for (const modifier of node.modifiers) {
                    if (modifier.kind === SyntaxKind.StaticKeyword) isStatic = true
                }
            }

            if (node.name.expression && node.name.expression.escapedText === "ormClassSettings_") {
                propertyName = "ormClassSettings_"

                if (!isStatic) {
                    console.error(`\nProperty '${propertyName}' of class ${snake2Pascal(classObj.name)} needs to be a static property.`)
                    process.exit(1)
                }
                columnObj = {}
                const value = node.initializer ?? {}
                //TODO special class settings
                if (value.kind == SyntaxKind.ObjectLiteralExpression) columnObj = handleSpecialClassSettingsObj(value)
                classObj.specialSettings = columnObj
            }
            else {
                if (isStatic) continue

                const typeScriptInvalidTypesArr = []
                propertyName = node.name.escapedText
                columnObj = { name: propertyName }

                if (node.jsDoc) {
                    const tagObj = node.jsDoc[0].tags[0]
                    const tagName = tagObj.tagName ? tagObj.tagName.escapedText : undefined
                    const typeObj = tagObj.typeExpression.type
                    if (typeObj.types) {
                        if (typeObj.types.length > 3) {
                            console.error(`\nInvalid typing error on property '${propertyName}' of class ${snake2Pascal(classObj.name)} - a property cannot have more than three types (one main type + undefined + Unique).`)
                            process.exit(1)
                        }
                        const typesObj = typeObj.types
                        for (const typeObj of typesObj) parseTypeObjContext(typeObj, columnObj, entityNamesArr, nonRelationalTypesArr, classObj.name, tagName)
                    }
                    else parseTypeObjContext(typeObj, columnObj, entityNamesArr, nonRelationalTypesArr, classObj.name, tagName)
                }
                else if (node.type) {
                    const typeObj = node.type
                    if (typeObj.types) {
                        if (typeObj.types.length > 3) {
                            console.error(`\nInvalid typing error on property '${propertyName}' of class ${snake2Pascal(classObj.name)} - a property cannot have more than three types (one main type + undefined + Unique).`)
                            process.exit(1)
                        }
                        const typesObj = typeObj.types
                        for (const typeObj of typesObj) parseTypeObjContext(typeObj, columnObj, entityNamesArr, nonRelationalTypesArr, classObj.name, undefined, typeScriptInvalidTypesArr)
                    }
                    else parseTypeObjContext(typeObj, columnObj, entityNamesArr, nonRelationalTypesArr, classObj.name, undefined, typeScriptInvalidTypesArr)
                }
                else if (node.initializer.kind === SyntaxKind.SatisfiesExpression) {
                    const typeObj = node.initializer
                    const satisfiesText = typeObj.getText()
                    const typeText = satisfiesText.split(`satisfies`)[1]
                    parseTypeObjContext(typeText, columnObj, entityNamesArr, nonRelationalTypesArr, classObj.name, `satisfies`, typeScriptInvalidTypesArr)
                }
                else {
                    console.error(`\nInvalid typing error on property '${propertyName}' of class ${snake2Pascal(classObj.name)} - property has no typing.`)
                    process.exit(1)
                }

                if (node.questionToken) columnObj.nullable = true

                if (!columnObj.type) noMainTypeOnColumnObjErr(propertyName, classObj, typeScriptInvalidTypesArr, [...nonRelationalTypesArr, ...entityNamesArr])
                else classObj.columns.push(columnObj)
            }
        }
    }
}

export function noMainTypeOnColumnObjErr(propertyName, classObj, typeScriptInvalidTypesArr, validMainTypesArr) {
    console.error(`\nInvalid typing error on property '${propertyName}' of class ${snake2Pascal(classObj.name)} - property has no main type.`)
    if (typeScriptInvalidTypesArr.length) console.error(`\nThe types ${array2String(typeScriptInvalidTypesArr)} may need to be paired with a main type from the following ${array2String(validMainTypesArr)} .`)
    process.exit(1)
}

export function entities2NodeArr(/**@type {{ [key: string]: function }}*/ entityObject) {
    if (!Object.keys(entityObject).length) return {}
    const nodeArr = []
    const nodes = Object.values(entityObject).map(entity => createSourceFile('', entity.toString(), ScriptTarget.Latest, true, ScriptKind.TSX).statements[0])
    for (const node of nodes) {
        //@ts-ignore
        if ((node.kind === SyntaxKind.ClassDeclaration || node.kind === SyntaxKind.ClassExpression) && node.heritageClauses)
            nodeArr.push(node)
    }
    return nodeArr
}

export function addChildrenToClasses(classDict) {
    const childrenArrDict = {}
    for (const classObj of Object.values(classDict)) {
        if (classObj.parent) {
            childrenArrDict[classObj.parent] ??= []
            childrenArrDict[classObj.parent].push(classObj.name)
        }
    }
    for (const [className, childrenArr] of Object.entries(childrenArrDict))
        classDict[className].children = childrenArr
}

export function recursiveBranch(classObj, branchArr, classDict, previousClassObj = undefined, branchLength = 0) {
    // takes leaves and turns them into branches
    // previousClassObj is actually the original leaf
    branchLength++
    if (previousClassObj) {
        /**@type {any}*/ let lastParent = previousClassObj
        for (let i = 0; i < branchLength - 1; i++) lastParent = lastParent.parent

        if (lastParent.parent) {
            const newParentObj = classDict[lastParent.parent]
            lastParent.parent = newParentObj
            recursiveBranch(newParentObj, branchArr, classDict, previousClassObj, branchLength)
        }
        else branchArr.push(previousClassObj)
    }
    else {
        if (classObj.parent) {
            const parent = classDict[classObj.parent]
            classObj.parent = parent
            recursiveBranch(parent, branchArr, classDict, classObj, branchLength)
        }
        else branchArr.push(classObj)
    }
}

export function createBranches(classDict) {
    const branches = []

    for (const classObj of Object.values(classDict)) {
        if (!classObj.children) {
            if (classObj.abstract) throw new Error(`\nInvalid class declaration - '${snake2Pascal(classObj.name)}' cannot be abstract since abstract classes must have children.`)
            recursiveBranch(classObj, branches, classDict)
        }
    }
    return branches
}

export function inheritColumns(inheritingClass) {
    let classObj = inheritingClass
    let parent

    while (classObj.parent) {
        parent = classObj.parent
        if (!parent.abstract) {

            inheritingClass.columns.unshift({})
            const { columns } = returnEntityClassObj()
            const [id, updatedAt] = columns
            inheritingClass.columns[0] = id
            inheritingClass.tableIdTypeInDb = id.type
            return parent
        }
        inheritingClass.columns.push(...parent.columns)
        classObj = parent
    }
}

export function linkClassMap(classMapsObj, dependenciesObj, referencesObj) {

    for (const classMap of Object.values(classMapsObj)) {
        const className = classMap.className

        if (classMap.parent) {
            const parentName = classMap.parent
            if (parentName === `Entity`) delete classMap.parent
            else classMap.parent = classMapsObj[parentName]
        }
        if (dependenciesObj[className]) classMap[dependenciesSymb] = dependenciesObj[className]
        if (referencesObj[className]) classMap[referencesSymb] = referencesObj[className]
    }

    for (const classMap of Object.values(classMapsObj)) {
        if (!Object.keys(classMap.junctions).length) delete classMap.junctions
        else {
            for (const [propertyName, junctionObj] of Object.entries(classMap.junctions)) {
                const className = junctionObj.className
                const { isArray, optional } = junctionObj
                classMap.junctions[propertyName] = { ...classMapsObj[className] }
                if (isArray) classMap.junctions[propertyName].isArray = true
                if (optional) classMap.junctions[propertyName].optional = true
            }
        }
    }
}

export function createClassMap(tableObj) {
    const tableNames = Object.keys(tableObj)
    const ormMapsObj = {}
    const dependenciesObj = {}
    const referencesObj = {}

    for (const name of tableNames) {
        const table = tableObj[name]
        const junctionMap = {}
        const map = {
            columns: {},
            junctions: junctionMap,
            className: snake2Pascal(table.name)
        }

        ormMapsObj[map.className] = map

        if (table.parent) map.parent = snake2Pascal(table.parent.name)

        for (const columnObj of Object.values(table.columns)) {
            const columnName = columnObj.name
            if (columnName === "id") {
                map.columns.id = { type: columnObj.type }
                continue
            }
            const { type, isArray, nullable } = columnObj

            if (columnObj.relational) {
                junctionMap[columnName] = {
                    className: type,
                    isArray: isArray,
                    optional: nullable
                }

                if (!isArray && !nullable) {
                    const targetTable = dependenciesObj[type] ??= {}
                    const dependantKeyArr = targetTable[map.className] ??= []
                    dependantKeyArr.push(columnName)
                }
                else {
                    const targetTable = referencesObj[type] ??= {}
                    const dependantKeyArr = targetTable[map.className] ??= []
                    dependantKeyArr.push(columnName)
                }
            }
            else {
                /**@type {any}*/ const { name, nullable, ...mapColumnObj } = columnObj
                if (nullable) mapColumnObj.optional = true
                if (mapColumnObj.type === `integer`) mapColumnObj.type = `number`
                map.columns[columnName] = mapColumnObj
            }
        }
    }
    linkClassMap(ormMapsObj, dependenciesObj, referencesObj)
    OrmStore.store.classWikiDict = ormMapsObj
}

export function createTableObject(branchArr) {
    let tableObj = {}
    for (const branch of branchArr) {
        if (branch.parent) {
            const newBranch = inheritColumns(branch)
            if (newBranch) branchArr.push(newBranch)
            tableObj[branch.name] = branch
        }
    }
    return tableObj
}

export function createJunctionColumnContext(tablesDict) {
    for (const tableObj of Object.values(tablesDict)) {
        const columns = tableObj.columns
        for (const columnObj of columns) {
            const isArray = columnObj.isArray
            if (columnObj.relational) {
                const snakedColumnType = nonSnake2Snake(columnObj.type)
                const joinedTable = tablesDict[snakedColumnType]
                columnObj.thisTableIdUnique = !isArray
            }
        }
    }
    columnArr2ColumnDict(tablesDict)
}


function formatRelationalColumnObj(tableObj, columnObj, tablesDict, sqlClient) {
    const newJunctionTable = {
        name: `${tableObj.name}___${nonSnake2Snake(columnObj.name)}_jt`,
        columns: {}
    }
    const joiningIdTypeInDb = js2SqlTyping(sqlClient, tableObj.columns.id.type, true)
    let newJunctionTableColumn = {
        type: joiningIdTypeInDb,
        unique: columnObj.thisTableIdUnique,
        refTable: tableObj.name
    }
    newJunctionTable.columns.joining = newJunctionTableColumn

    const joinedTableName = columnObj.type
    const joinedTable = tablesDict[joinedTableName] || tablesDict[nonSnake2Snake(joinedTableName)]
    const joinedIdTypeInDb = js2SqlTyping(sqlClient, joinedTable.columns.id.type, true)

    newJunctionTableColumn = {
        type: joinedIdTypeInDb,
        unique: false,
        refTable: nonSnake2Snake(joinedTableName)
    }
    newJunctionTable.columns.joined = newJunctionTableColumn
    return newJunctionTable
}


export function formatForCreation(tablesDict) {
    /**@type {TABLE[]}*/ const formattedTables = []
    const alterTableArr = []
    const sqlClient = OrmStore.store.sqlClient

    for (const tableObj of Object.values(tablesDict)) {
        if (tableObj.alreadyExists) {
            if (!tableObj.newColumns) continue
            alterTableArr.push(tableObj)
            continue
        }

        /**@type {TABLE}*/ const formattedTable = {
            name: tableObj.name,
            columns: {},
            junctions: []
        }

        if (tableObj.parent) formattedTable.parent = tableObj.parent.name

        for (const columnObj of Object.values(tableObj.columns)) {
            if (columnObj.relational) formattedTable.junctions?.push(formatRelationalColumnObj(tableObj, columnObj, tablesDict, sqlClient))
            else {
                const { name, ...rest } = columnObj
                formattedTable.columns[`${name}`] = rest
            }
        }
        formattedTables.push(formattedTable)
    }
    return [formattedTables, alterTableArr]
}
export function produceTableCreationQuery(/**@type {TABLE}*/ table, /**@type {boolean}*/ isJunction = false) {
    let query = `CREATE TABLE ${table.name} (\n`

    if (!isJunction) {
        const primaryKeyType = table.columns.id.type
        query += ` id ${primaryKeyType} PRIMARY KEY,\n`

        const columnEntries = Object.entries(table.columns).filter(column => column[0] !== "id")
        query += columnEntries2QueryStr(columnEntries)

        if (table.parent) query += `FOREIGN KEY (id) REFERENCES ${table.parent}(id) ON DELETE CASCADE \n);`
        else query = query.slice(0, -3) + `);`
    }
    else {
        const columns = Object.entries(table.columns)

        const baseColumn = {
            type: columns[0][1].type,
            unique: columns[0][1].unique,
            ref: columns[0][1][`refTable`]
        }
        const referencedColumn = {
            type: columns[1][1].type,
            unique: columns[1][1].unique,
            ref: columns[1][1][`refTable`]
        }
        query += ` joining_id ${baseColumn.type}`

        if (baseColumn.unique) {
            query += ` PRIMARY KEY`
            query += ` REFERENCES ${baseColumn.ref}(id) ON DELETE CASCADE, \n`
            query += `joined_id ${referencedColumn.type} NOT NULL REFERENCES ${referencedColumn.ref}(id) ON DELETE CASCADE`
        }
        else {
            query += ` NOT NULL REFERENCES ${baseColumn.ref}(id) ON DELETE CASCADE, \n`
            query += `joined_id ${referencedColumn.type} NOT NULL REFERENCES ${referencedColumn.ref}(id) ON DELETE CASCADE, \n`
            query += `PRIMARY KEY (joining_id, joined_id)`
        }
        query += `\n);`
    }
    return query
}

export function columnEntries2QueryStr(columnEntries) {
    let queryStr = ``
    const client = OrmStore.store.sqlClient

    if (client === "postgresql") {
        for (const column of columnEntries) {
            const columnName = nonSnake2Snake(column[0])

            const { nullable, unique, type, defaultValue } = column[1]
            queryStr += ` ${columnName} ${type}`
            queryStr += nullable ? `` : ` NOT NULL`
            queryStr += unique ? ` UNIQUE` : ``

            //TODO BELOW, DEFAULT VALUE IS PROBABLY REDUNDANT? even though it might not be...lets you
            // set values without using args with default values in constructor, which can limit freedom because of args order
            // if we keep this, need to account for this during row creation save
            // query +=
            // 	defaultValue !== undefined
            // 		? ` DEFAULT ${typeof defaultValue === `object`
            // 			? `'${JSON.stringify(defaultValue)}'`
            // 			: defaultValue
            // 		}`
            // 		: ``

            queryStr += `, \n`
        }
    }
    else {
        for (const column of columnEntries) {
            const columnName = nonSnake2Snake(column[0])
            const { nullable, unique, type, defaultValue } = column[1]

            if (type.endsWith('[]')) queryStr += ` ${columnName} TEXT`
            else queryStr += ` ${columnName} ${type}`

            queryStr += nullable ? `` : ` NOT NULL`
            queryStr += unique ? ` UNIQUE` : ``
            queryStr += `, \n`
        }
    }
    return queryStr
}

export function sqlTypeTableObj(tableObj, sqlClient) {
    if (tableObj.parent === `entity`) delete tableObj.parent

    const columnObjectsArr = Object.values(tableObj.columns)

    if (sqlClient === `postgresql`) {
        for (const columnObj of columnObjectsArr) {
            if (columnObj.isArray) {
                if (columnObj.type === `object`) columnObj.type = `JSONB`
                else columnObj.type = js2SqlTyping(sqlClient, columnObj.type) + `[]`
            }
            else columnObj.type = js2SqlTyping(sqlClient, columnObj.type)
        }
    }
    else {
        for (const columnObj of columnObjectsArr) {
            if (columnObj.isArray) columnObj.type = `TEXT`
            else columnObj.type = js2SqlTyping(sqlClient, columnObj.type)
        }
    }
}

export function generateTableCreationQueryObject(formattedTables) {
    const sqlClient = OrmStore.store.sqlClient
    for (const tableObj of Object.values(formattedTables)) {
        sqlTypeTableObj(tableObj, sqlClient)
        if (floatColumnTypes.includes(tableObj.columns.id.type)) tableObj.columns.id.type = 'INTEGER'
    }

    const rootTables = formattedTables.filter(table => !table.parent)
    const childrenTables = formattedTables.filter(table => table.parent)

    const tableQueryObject = {}
    const junctionQueriesArr = []

    for (const rootTable of rootTables) produceQueryObj(rootTable, tableQueryObject, childrenTables, junctionQueriesArr)

    return { tableQueryObject, junctionQueriesArr }
}

export async function sendQueryFromQueryObj(queryObj, queryFunc) {
    const { query, children } = queryObj
    await queryFunc(query)

    if (children) {
        const childrenQueryObjects = Object.values(children)
        for (const queryObject of childrenQueryObjects) await sendQueryFromQueryObj(queryObject, queryFunc)
    }
}

export async function sendTableCreationQueries(tableCreationObj) {
    const { dbConnection, sqlClient } = OrmStore.store
    let queryFunc
    if (sqlClient === "postgresql") queryFunc = dbConnection.query.bind(dbConnection)
    else queryFunc = (query) => dbConnection.exec(query)

    const queryFuncWithTryCatch = async (query) => {
        try {
            await queryFunc(query)
        }
        catch (e) {
            coloredBackgroundConsoleLog(`Error while creating tables. ${e}\n`, `failure`)
        }
    }

    const tableQueryObjectsEntries = Object.entries(tableCreationObj.tableQueryObject)
    coloredBackgroundConsoleLog(`Updating database tables...\n`, `success`)
    for (const [tableName, queryObj] of tableQueryObjectsEntries) await sendQueryFromQueryObj(queryObj, queryFuncWithTryCatch)
    for (const query of tableCreationObj.junctionQueriesArr) await queryFuncWithTryCatch(query)
}




export function produceQueryObj(rootTable, tableQueryObject, childrenTables, junctionQueriesArr) {
    const query = produceTableCreationQuery(rootTable)

    const junctions = rootTable.junctions
    for (const junctionTable of junctions) junctionQueriesArr.push(produceTableCreationQuery(junctionTable, true))

    const rootTableQueryObj = tableQueryObject[rootTable.name] = { query }
    const children = childrenTables.filter(table => table.parent === rootTable.name)
    childrenTables = childrenTables.filter(table => table.parent !== rootTable.name)
    if (children.length) {
        const tableQueryObject = rootTableQueryObj[`children`] = {}
        for (const childTable of children) produceQueryObj(childTable, tableQueryObject, childrenTables, junctionQueriesArr)
    }
}


export function handleSpecialSettingId(tablesDict) {
    for (const classObj of Object.values(tablesDict)) {
        if (classObj.parent.name === 'entity' && classObj.specialSettings && classObj.specialSettings.idType) {
            const settingsObj = classObj.specialSettings
            const specialIdType = settingsObj.idType
            let idObj = idType2IdColumnObj(specialIdType)
            classObj.columns.id = idObj
            if (classObj.children) changeIdColumnOnChildren(idObj, tablesDict, classObj.children)
        }
    }
}

export function changeIdColumnOnChildren(idObj, classesObj, childrenNameArr) {
    const nextChildrenNameArr = []
    for (const childName of childrenNameArr) {
        const childObj = classesObj[childName]
        childObj.columns.id = idObj
        if (childObj.children) nextChildrenNameArr.push(...childObj.children)
    }
    if (nextChildrenNameArr.length) changeIdColumnOnChildren(idObj, classesObj, nextChildrenNameArr)
}

export function idType2IdColumnObj(idType) {
    let idColumnObj
    if (idType === "UUID") {
        idColumnObj = { name: "id", type: "string" }
    }
    else if (idType === "INT") {
        idColumnObj = { name: "id", type: "number" }
    }
    else if (idType === "BIGINT") {
        idColumnObj = { name: "id", type: "bigint" }
    }
    else throw new Error(`\n'${idType}' is not a valid primary key type.`)
    return idColumnObj
}

export function columnArr2ColumnDict(tablesObj) {
    for (const tableObj of Object.values(tablesObj)) {
        const columnsDictObj = {}
        for (const columnObj of tableObj.columns) {
            columnsDictObj[columnObj.name] = columnObj
        }
        tableObj.columns = columnsDictObj
    }
}

// export function filterTableArray(tableArray) {
//     let filteredArr = []
//     for (let table of tableArray) {
//         let ancestorOfEntity = false
//         let currentTable = table
//         while (currentTable.parent) {
//             if (currentTable.parent.name === 'entity') ancestorOfEntity = true
//             currentTable = currentTable.parent
//         }
//         if (ancestorOfEntity) filteredArr.push(table)
//     }
//     return filteredArr
// }


export async function alterTables(tables2alterArr) {
    if (!tables2alterArr.length) return

    const { sqlClient, dbConnection, classWikiDict } = OrmStore.store
    const queryFunc = sqlClient === `postgresql`
        ? async (alterStatements, junctionStatements) => {
            try {
                if (alterStatements.length) await dbConnection.query(alterStatements.join(`, `))
                if (junctionStatements.length) {
                    await dbConnection.query('BEGIN;')
                    for (const statement of junctionStatements) await dbConnection.query(statement)
                    await dbConnection.query('COMMIT;')
                }
            }
            catch (e) {
                if (junctionStatements.length) await dbConnection.query('ROLLBACK;')
                coloredBackgroundConsoleLog(e, "failure")
            }
        }
        : (alterStatements, junctionStatements) => {
            const statements = [...alterStatements, ...junctionStatements]
            try {
                dbConnection.exec('BEGIN;')
                for (const statement of statements) {
                    dbConnection.exec(statement)
                }
                dbConnection.exec('COMMIT;')
            }
            catch (e) {
                dbConnection.exec('ROLLBACK;')
                coloredBackgroundConsoleLog(e, "failure")
            }
        }

    let alterTableStr
    const alterStatements = []
    const newJunctionStatements = []

    for (const tableObj of tables2alterArr) {
        alterTableStr = `ALTER TABLE ${tableObj.name} `
        const idColumn = tableObj.columns.id
        tableObj.columns = structuredClone(tableObj.newColumns)
        sqlTypeTableObj(tableObj, sqlClient)

        tableObj.columns.id = idColumn

        for (const [columnName, columnObj] of Object.entries(tableObj.newColumns)) {
            const { type, nullable, isArray, relational } = columnObj
            let statement
            if (relational) {
                const junctionTableObj = formatRelationalColumnObj(tableObj, columnObj, classWikiDict, sqlClient)
                statement = produceTableCreationQuery(junctionTableObj, true)
                newJunctionStatements.push(statement)
            }
            else {
                statement = `ADD COLUMN ${nonSnake2Snake(columnName)} ${tableObj.columns[columnName].type} `
                if (!nullable) statement += `NOT NULL DEFAULT ${type2DefaultValue(type, isArray, sqlClient)}`
                alterStatements.push(alterTableStr + statement)
            }
        }
    }

    await queryFunc(alterStatements, newJunctionStatements)
}

function type2DefaultValue(type, isArray, sqlClient) {
    //need to get correct types from tableObj.newColumns
    if (sqlClient === `postgresql`) {
        if (isArray) {
            const typeCast = js2SqlTyping(sqlClient, type)
            return `ARRAY[]::${typeCast}[]`
        }
        else if (type === `string`) return `''`
        else if (type === `boolean`) return false
        else if (type === `number` || type === `integer`) return 0
        else if (type === `bigint`) return `0`
        else if (type === `object`) return `'{}'::JSONB`
    }

    if (isArray) return `'[]'`
    else if (type === `string`) return `''`
    else if (type === `boolean`) return 0
    else if (type === `number` || type === `integer`) return 0
    else if (type === `bigint`) return `0`
    else if (type === `object`) return `'{}'`
}