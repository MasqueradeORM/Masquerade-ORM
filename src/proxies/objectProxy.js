import { ChangeLogger } from "../changeLogger/changeLogger.js"
import { OrmStore } from "../misc/ormStore.js"
import { setUpdatedAtValue } from "./instanceProxy.js"


function objectProxySetHandler(instanceWithObj, targetProp, isInsideAnArray, className) {
    const classChangeObj = OrmStore.getClassChangesObj(className)
    const instanceId = instanceWithObj.id
    let newPropVal = instanceWithObj[targetProp].source_
    if (isInsideAnArray) newPropVal = JSON.stringify(newPropVal)
    if (classChangeObj[instanceId]) classChangeObj[instanceId][targetProp] = newPropVal
    else classChangeObj[instanceId] = { targetProp: newPropVal }
    setUpdatedAtValue(instanceWithObj, classChangeObj[instanceId])
    return true
}

export function createObjectProxy(instanceWithObj, key4object, object, isInsideAnArray = false) {
    const className = instanceWithObj.constructor.name

    return new Proxy(object, {
        get: (obj, key) => {
            if (key === `source_`) return obj
            return obj[key]
        },
        set: (obj, /**@type {string}*/ key, val) => {
            obj[key] = val
            return objectProxySetHandler(instanceWithObj, key4object, isInsideAnArray, className)
        },
        defineProperty: (obj, /**@type {string}*/ key, val) => {
            obj[key] = val
            return objectProxySetHandler(instanceWithObj, key4object, isInsideAnArray, className)
        },
        deleteProperty(obj, key) {
            const validProp = Object.hasOwn(obj, key)
            const returnedVal = Reflect.deleteProperty(obj, key)
            if (validProp) {
                const classChangeObj = OrmStore.getClassChangesObj(className)
                const instanceChangeObj = classChangeObj[instanceWithObj.id] ??= {}
                let newValueOfTargetProp = isInsideAnArray ? [...instanceWithObj[key4object].source_] : instanceWithObj[key4object].source_
                if (isInsideAnArray) {
                    newValueOfTargetProp.forEach((object, index) => newValueOfTargetProp[index] = object.source_)
                    newValueOfTargetProp = JSON.stringify(newValueOfTargetProp)
                }
                instanceChangeObj[key4object] = newValueOfTargetProp
                setUpdatedAtValue(instanceWithObj, instanceChangeObj)
            }
            return returnedVal
        }
    })
}