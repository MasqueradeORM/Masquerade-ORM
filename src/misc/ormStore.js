export class OrmStore {
    static store = {}

    static getClassChangesObj(instanceClass) {
        const classChangesObj = this.store.dbChangesObj[instanceClass] ??= {}
        return classChangesObj
    }

    static clearDbChanges() {
        const dbChanges = this.store.dbChangesObj
        for (const key of Object.keys(dbChanges)) delete dbChanges[key]
    }

    static getClassWiki(instanceClass) {
        return this.store.classWikiDict[instanceClass]
    }
}

