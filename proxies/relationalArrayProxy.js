import { ChangeLogger } from "../changeLogger/changeLogger.js"
import { OrmStoreSymb } from "../misc/constants.js"
import { getValidTypedArray } from "../misc/miscFunctions.js"
import { setUpdatedAtValue } from "./instanceProxy.js"


export function createRelationalArrayProxy(instance, propertyName, array = [], /**@type {string | undefined}*/ arrElementValidType = undefined) {
    const instanceId = instance.id
    const instanceClass = instance.constructor.name
    const classChangeObj = globalThis[OrmStoreSymb].dbChangesObj[instanceClass] ??= {}

    //if arrElementValidType is undefined, it just means that the array we are proxifying is an array we got from the db, so the typing is correct.
    const eventListenersObj = {}
    if (arrElementValidType) array = getValidTypedArray(array, arrElementValidType, true)
    array.forEach(proxy => addEventListener2ArrayProxy(proxy, array, eventListenersObj, instance.id, propertyName, classChangeObj))

    return new Proxy(array, {
        //ARRAY PROXIES ARE FOR RELATIONAL X:N
        get(target, key, receiver) {
            if (key === "source_") return target
            else if (key === "eListener_") return eventListenersObj
            else {
                if (key === "includes") return (instance) => {
                    //@ts-ignore
                    if (eventListenersObj[instance.id]) return true
                    return false
                }
                return target[key]
            }
        },
        set(/**@type {any[]}*/ target, key, value, receiver) {
            if (key === "length") return Reflect.set(target, key, value, receiver)
            return relationalArrayProxySetHandler(target, key, value, propertyName, instanceId, eventListenersObj, classChangeObj)
        },
        deleteProperty(target, key) {
            return relationalArrayProxyDeleteHandler(target, key, propertyName, instanceId, eventListenersObj, classChangeObj)
        }
    })
}


export function relationalArrayProxySetHandler(target, key, newInstanceProxy, propertyName, instanceId, eventListenersObj, classChangeObj) {
    const index = parseInt(key)
    if (index > -1) {
        const oldInstanceProxy = target[index]
        const instanceChangesObj = classChangeObj[instanceId] ??= {}
        setUpdatedAtValue(target, instanceChangesObj)

        if (eventListenersObj[newInstanceProxy.id]) throw new Error(`Do not insert duplicate entity instances into a relational array.`)
        const relationChangeLogger = instanceChangesObj[propertyName] ??= { added: [], removed: [] }

        if (oldInstanceProxy) {
            const oldValueInAdded = relationChangeLogger.added.indexOf(oldInstanceProxy.id)
            if (oldValueInAdded > -1) relationChangeLogger.added.splice(oldValueInAdded, 1)
            else relationChangeLogger.removed.push(oldInstanceProxy.id)

            const oldProxyEventEmitter = oldInstanceProxy.eEmitter_
            oldProxyEventEmitter.removeEventListener("delete", eventListenersObj[oldInstanceProxy.id])
            delete eventListenersObj[oldInstanceProxy.id]
        }
        const newValueInRemoved = relationChangeLogger.removed.indexOf(newInstanceProxy.id)
        if (newValueInRemoved > -1) relationChangeLogger.removed.splice(newValueInRemoved, 1)
        else relationChangeLogger.added.push(newInstanceProxy.id)

        target[index] = newInstanceProxy
        addEventListener2ArrayProxy(newInstanceProxy, target, eventListenersObj, instanceId, propertyName, classChangeObj)
        ChangeLogger.flushChanges()
        return true
    }
    else if (typeof index === `string` || typeof index === `symbol`) {
        target[index] = newInstanceProxy
        return true
    }
    return false
}

export function relationalArrayProxyDeleteHandler(target, key, propertyName, instanceId, eventListenersObj, classChangeObj) {
    const validProp = Object.hasOwn(target, key)
    const deletedArrEl = target[key]

    if (validProp) {
        //@ts-ignore
        const index = parseInt(key)
        if (index > -1) {
            const instanceChangesObj = classChangeObj[instanceId] ??= {}
            const removedEventFunc = eventListenersObj[deletedArrEl.id]
            deletedArrEl.eEmitter_.removeEventListener("delete", removedEventFunc)
            logRelationalArrayRemoval(deletedArrEl.id, propertyName, instanceChangesObj)
            ChangeLogger.flushChanges()
        }
        delete target[key]
        return true
    }
    return false
}

export function logRelationalArrayRemoval(removedId, propertyName, instanceChangesObj) {
    if (!instanceChangesObj[propertyName]) {
        /**@type {any}*/ const relationalArrChangeLogger = instanceChangesObj[propertyName] = { added: [], removed: [] }
        relationalArrChangeLogger.removed.push(removedId)
    }
    else {
        const relationalArrChangeLogger = instanceChangesObj[propertyName]
        const oldIndex = relationalArrChangeLogger.added.indexOf(removedId)
        if (oldIndex > -1) relationalArrChangeLogger.added.splice(oldIndex, 1)
        else relationalArrChangeLogger.removed.push(removedId)
    }
}

export function addEventListener2ArrayProxy(proxy, array, eventListenersObj, idOfInstanceWithArray, propertyOfArray, classChangeObj) {
    const emitter = proxy.eEmitter_
    const eventFunc = (event) => {
        const id2delete = event.detail.id
        console.log(`Delete event sent from ${id2delete}_${proxy.constructor.name} to proxy array`)
        const index = array.findIndex(proxy => proxy.id === id2delete)
        array.splice(index, 1)
        delete eventListenersObj[id2delete]

        const instanceChangesObj = classChangeObj[idOfInstanceWithArray] ??= {}
        logRelationalArrayRemoval(id2delete, propertyOfArray, instanceChangesObj)
    }

    emitter.addEventListener(
        "delete",
        eventFunc,
        { once: true }
    )

    eventListenersObj[proxy.id] = eventFunc
}