export class OrmStore {
    static store = {}

    static getClassChangesObj(instanceClass) {
        const classChangesObj = this.store.dbChangesObj[instanceClass] ??= {}
        return classChangesObj
    }

    static clearDbChanges() {
        const dbChanges = this.store.dbChangesObj
        for (const key in dbChanges) delete dbChanges[key]
    }

    static getClassWiki(instanceClass) {
        if (typeof instanceClass === 'string')
        return this.store.classWikiDict[instanceClass]

        return this.store.classWikiDict[instanceClass.constructor.name]
    }
}

