import { ChangeLogger } from "../changeLogger/changeLogger.js"
import { getValidTypedArray } from "../misc/miscFunctions.js"
import { OrmStore } from "../misc/ormStore.js"
import { setUpdatedAtValue } from "./instanceProxy.js"
import { createObjectProxy } from "./objectProxy.js"


export function createNonRelationalArrayProxy(instanceContainingArray, propertyName, array, /**@type {string | undefined}*/ arrElementValidType = undefined, arrayOfObjects = false) {
    const instanceClass = instanceContainingArray.constructor.name
    //if arrElementValidType is undefined, it just means that the array we are proxifying is an array we got from the db, so the typing is correct.
    if (arrElementValidType) array = getValidTypedArray(array, arrElementValidType, false)
    if (arrayOfObjects) {
        for (let i = 0; i < array.length; i++) {
            array[i] = createObjectProxy(instanceContainingArray, propertyName, array[i], arrayOfObjects)
        }
    }
    return new Proxy(array, {
        get(target, key, receiver) {
            if (key === "source_") return target
            return target[key]
        },
        set(/**@type {any[]}*/ target, key, value, receiver) {
            if (key === "length") return Reflect.set(target, key, value, receiver)
            return nonRelationalArrayProxySetHandler(target, key, value, propertyName, instanceContainingArray, arrayOfObjects, instanceClass)
        },
        deleteProperty(target, key) {
            return nonRelationalArrayProxyDeleteHandler(target, key, propertyName, instanceContainingArray, instanceClass)
        }
    })
}


export function nonRelationalArrayProxyDeleteHandler(array, key, propertyName, instanceContainingArray, instanceClass) {
    const validProp = Object.hasOwn(array, key)
    if (validProp) {
        //@ts-ignore
        const index = parseInt(key)
        if (index > -1) {
            const classChangeObj = OrmStore.getClassChangesObj(instanceClass)
            const instanceChangesObj = classChangeObj[instanceContainingArray.id] ??= {}
            instanceChangesObj[propertyName] = array
            setUpdatedAtValue(instanceContainingArray, instanceChangesObj)
            return true
        }
        delete array[key]
        return true
    }
    return false
}

export function nonRelationalArrayProxySetHandler(array, key, value, propertyName, instanceContainingArray, arrayOfObjects, instanceClass) {
    const index = parseInt(key)
    if (index > -1) {
        const classChangeObj = OrmStore.getClassChangesObj(instanceClass)
        const instanceChangesObj = classChangeObj[instanceContainingArray.id] ??= {}
        
        if (arrayOfObjects) {
            value = createObjectProxy(instanceContainingArray, propertyName, value, true)
            array[index] = value
            const arrayCopy = []
            array.forEach((proxy, index) => arrayCopy[index] = proxy.source_)
            instanceChangesObj[propertyName] = JSON.stringify(arrayCopy)
        }
        else {
            array[index] = value
            instanceChangesObj[propertyName] = array
        }
        setUpdatedAtValue(instanceContainingArray, instanceChangesObj)
        return true
    }
    else if (array[key]) {
        array[key] = value
        return true
    }
    return false
}