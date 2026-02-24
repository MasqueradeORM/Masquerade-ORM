// Copyright 2026 B.G (github.com/MasqueradeORM)
// SPDX-License-Identifier: Apache-2.0

import { ChangeLogger } from "../changeLogger/changeLogger.js"
import { getValidTypedArray } from "../misc/miscFunctions.js"
import { OrmStore } from "../misc/ormStore.js"
import { setUpdatedAtValue } from "./instanceProxy.js"


export function createRelationalArrayProxy(instance, propertyName, array = [], /**@type {string | undefined}*/ arrElementValidType = undefined) {
    if (array === undefined) array = []
    const instanceId = instance.id
    const instanceClass = instance.constructor.name
    //const classChangeObj = OrmStore.getClassChangesObj(instanceClass)
    const eventListenersObj = {}
    //if arrElementValidType is undefined, it just means that the array we are proxifying is an array we got from the db, so the typing is correct.
    if (arrElementValidType) array = getValidTypedArray(array, arrElementValidType, true)
    array.forEach(proxy => addEventListener2ArrayProxy(proxy, array, eventListenersObj, instance.id, propertyName, instanceClass))

    return new Proxy(array, {
        //ARRAY PROXIES ARE FOR RELATIONAL X:N
        get(target, key) {
            if (key === "source_") return target
            else if (key === "eListener_") return eventListenersObj

            if (key === "includes") return (instance) => {
                if (eventListenersObj[instance.id]) return true
                return false
            }
            else if (key === "sort") {
                return function (sortArgFunc) {
                    const sorted = Array.prototype.sort.call(target, sortArgFunc)
                    return sorted
                }
            }
            return target[key]
        },
        set(/**@type {any[]}*/ target, key, value, receiver) {
            if (key === "length") return Reflect.set(target, key, value, receiver)
            return relationalArrayProxySetHandler(target, key, value, propertyName, instanceId, eventListenersObj, instanceClass)
        },
        deleteProperty(target, key) {
            return relationalArrayProxyDeleteHandler(target, key, propertyName, instanceId, eventListenersObj, instanceClass)
        }
    })
}


export function relationalArrayProxySetHandler(target, key, newInstanceProxy, propertyName, instanceId, eventListenersObj, instanceClass) {
    const newId = newInstanceProxy.id
    if (eventListenersObj[newId]) throw new Error(`Do not insert duplicate entity instances into a relational array. Use the 'includes' method for O(1) lookup.`)
    const index = parseInt(key)
    if (index > -1) {
        const oldInstanceProxy = target[index]
        const classChangeObj = OrmStore.getClassChangesObj(instanceClass)
        const instanceChangesObj = classChangeObj[instanceId] ??= {}
        const relationChangeLogger = instanceChangesObj[propertyName] ??= { add: {}, remove: {} }
        const { add, remove } = relationChangeLogger

        if (oldInstanceProxy) {
            const oldId = oldInstanceProxy.id
            if (add[oldId]) delete add[oldId]
            else remove[oldId] = true

            const oldProxyEventEmitter = oldInstanceProxy.eEmitter_
            // do not emit event to array any longer
            oldProxyEventEmitter.removeEventListener("delete", eventListenersObj[oldId])
            delete eventListenersObj[oldId]
        }

        if (remove[newId]) delete remove[newId]
        else add[newId] = true

        target[index] = newInstanceProxy
        addEventListener2ArrayProxy(newInstanceProxy, target, eventListenersObj, instanceId, propertyName, instanceClass)
        setUpdatedAtValue(target, instanceChangesObj)
        return true
    }
    else if (typeof index === `string` || typeof index === `symbol`) {
        target[index] = newInstanceProxy
        return true
    }
    return false
}

export function relationalArrayProxyDeleteHandler(target, key, propertyName, instanceId, eventListenersObj, instanceClass) {
    const validProp = Object.hasOwn(target, key)
    const deletedArrEl = target[key]

    if (validProp) {
        //@ts-ignore
        const index = parseInt(key)
        if (index > -1) {
            const classChangeObj = OrmStore.getClassChangesObj(instanceClass)
            const instanceChangesObj = classChangeObj[instanceId] ??= {}
            const removedEventFunc = eventListenersObj[deletedArrEl.id]
            deletedArrEl.eEmitter_.removeEventListener("delete", removedEventFunc)
            logRelationalArrayRemoval(target, propertyName, deletedArrEl.id, instanceChangesObj)
        }
        delete target[key]
        return true
    }
    return false
}

export function logRelationalArrayRemoval(instance, propertyName, removedId, instanceChangesObj) {
    const relationalArrChangeLogger = instanceChangesObj[propertyName]
    if (!relationalArrChangeLogger) {
        instanceChangesObj[propertyName] = { add: {}, remove: { [removedId]: true } }
    }
    else {
        const { add, remove } = relationalArrChangeLogger
        if (add[removedId]) delete add[removedId]
        else remove[removedId] = true
    }
    setUpdatedAtValue(instance, instanceChangesObj)
}

export function addEventListener2ArrayProxy(proxy, array, eventListenersObj, idOfInstanceWithArray, propertyOfArray, instanceClass) {
    const emitter = proxy.eEmitter_
    const listenerIdArr = [proxy.constructor.name, proxy.id]
    const { entityMapsObj } = OrmStore.store
    const eventFunc = (event) => {
        const [className, id] = listenerIdArr
        const entityMap = entityMapsObj[className]
        if (!entityMap) return
        let listeningInstance = entityMap.get(id)
        if (!listeningInstance) return
        listeningInstance = listeningInstance.deref()
        if (listeningInstance._isDeleted_) return
        const id2delete = event.detail.id
        delete eventListenersObj[id2delete]
        // console.log(`Delete event sent from ${id2delete}_${proxy.constructor.name} to proxy array`)
        const index = array.findIndex(proxy => proxy.id === id2delete)
        if (index === -1) return
        array.splice(index, 1)
        const classChangeObj = OrmStore.getClassChangesObj(instanceClass)
        const instanceChangesObj = classChangeObj[idOfInstanceWithArray] ??= {}
        logRelationalArrayRemoval(listeningInstance, propertyOfArray, id2delete, instanceChangesObj)
    }

    emitter.addEventListener(
        "delete",
        eventFunc,
        { once: true }
    )

    eventListenersObj[proxy.id] = eventFunc
}