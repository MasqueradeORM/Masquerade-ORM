export function throwDeletionErr(className, id4Deletion) {
    throw new Error(`Unable to delete ${className} with id of ${id4Deletion} due to potential relational dependencies. Use the async method 'getDependents' to get relational dependency data and decouple it from the deleted instance for the deletion to work.`)
}

export function throwImproperDecouplingErr(className, id4Deletion) {
    throw new Error(`Unable to delete ${className} with id of ${id4Deletion} due to incomplete decoupling.`)
}


export function validateDependentDataDecoupling(dependentsData, id4deletion) {
    for (const dependency2dArr of Object.values(dependentsData)) {
        const [dependentInstanceArr, props2Check] = dependency2dArr
        for (const instance of dependentInstanceArr) {
            for (const prop of props2Check) {
                if (instance[prop].id === id4deletion) return false
            }
        }
    }
    return true
}