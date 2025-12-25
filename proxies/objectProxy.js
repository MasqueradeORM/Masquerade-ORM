import { ChangeLogger } from "../changeLogger/changeLogger.js"
import { OrmStoreSymb } from "../misc/constants.js"
import { setUpdatedAtValue } from "./instanceProxy.js"


function objectProxySetHandler(instanceWithObj, targetProp, classChangeObj, isInsideAnArray) {
    const instanceId = instanceWithObj.id
    let newPropVal = instanceWithObj[targetProp].source_
    if (isInsideAnArray) newPropVal = JSON.stringify(newPropVal)
    if (classChangeObj[instanceId]) classChangeObj[instanceId][targetProp] = newPropVal
    else classChangeObj[instanceId] = { targetProp: newPropVal }
    setUpdatedAtValue(instanceWithObj, classChangeObj[instanceId])
    ChangeLogger.flushChanges()
    return true
}

export function createObjectProxy(instanceWithObj, key4object, object, isInsideAnArray = false) {
    const dbChangesObj = globalThis[OrmStoreSymb].dbChangesObj
    const className = instanceWithObj.constructor.name
    const classChangeObj = dbChangesObj[className] ??= {}
    return new Proxy(object, {
        get: (obj, key) => {
            if (key === `source_`) return obj
            return obj[key]
        },
        set: (obj, /**@type {string}*/ key, val) => {
            obj[key] = val
            return objectProxySetHandler(instanceWithObj, key4object, classChangeObj, isInsideAnArray)
        },
        defineProperty: (obj, /**@type {string}*/ key, val) => {
            obj[key] = val
            return objectProxySetHandler(instanceWithObj, key4object, classChangeObj, isInsideAnArray)
        },
        deleteProperty(obj, key) {
            const validProp = Object.hasOwn(obj, key)
            const returnedVal = Reflect.deleteProperty(obj, key)
            if (validProp) {
                const instanceChangeObj = classChangeObj[instanceWithObj.id] ??= {}
                setUpdatedAtValue(instanceWithObj, instanceChangeObj)
                let newValueOfTargetProp = isInsideAnArray ? [...instanceWithObj[key4object].source_] : instanceWithObj[key4object].source_ 
                if (isInsideAnArray) {
                    newValueOfTargetProp.forEach((object, index) => newValueOfTargetProp[index] = object.source_)
                    newValueOfTargetProp = JSON.stringify(newValueOfTargetProp)
                }
                instanceChangeObj[key4object] = newValueOfTargetProp
                ChangeLogger.flushChanges()
            }
            return returnedVal
        }
    })
}