
import test from 'node:test'
import assert from "node:assert"
import * as classes from './testing-classes.js'
import { resetPostgresDb, initPostgresDb, createConfigObj } from "./testInit.js"
import { sql } from '..//src/entity/find/where/whereArgsFunctions.js'
import { generateFamiliesAndHouses } from "./generationFuncs.js"
import { validateUpdatedAt } from "./miscFunctions.js"
import { OrmStore } from '../src/misc/ormStore.js'

const { House, Person, NonRelationalClass, NonRelationalClass2 } = classes

const configObj = createConfigObj()
await resetPostgresDb(configObj.dbConnection)
await initPostgresDb(configObj, classes)
let dbChanges = OrmStore.store.dbChangesObj
generateFamiliesAndHouses()
for (let i = 0; i < 3; i++) new NonRelationalClass2()

const nonRelationalTest = await NonRelationalClass2.find({ where: { json: sql`->>'someInt' = '5'` } })
test('test 1 - find basics and change logging', async (t) => {

  await t.test('find basics', async (t) => {

    await t.test('find result length is correct', async () => {
      assert.strictEqual(nonRelationalTest.length, 3)
    })

    await t.test('find returns correct typing', async () => {
      assert.strictEqual(typeof nonRelationalTest[0].bigint, 'bigint')
      assert.strictEqual(typeof nonRelationalTest[0].boolean, 'boolean')
      assert.strictEqual(typeof nonRelationalTest[0].stringArr[0], 'string')
      assert.strictEqual(typeof nonRelationalTest[0].id, 'number')
      assert.strictEqual(typeof nonRelationalTest[0].json, 'object')
      assert.strictEqual(typeof nonRelationalTest[0].jsonArr[0], 'object')
      assert.ok(Array.isArray(nonRelationalTest[0].stringArr))
      assert.ok(Array.isArray(nonRelationalTest[0].jsonArr))
    })
  })

  await t.test('assignments and dbChanges', async (t) => {
    const typeTestId = nonRelationalTest[0].id.toString()
    nonRelationalTest[0].int = 157

    const testInstanceChangeLog = dbChanges.NonRelationalClass2[typeTestId]

    /** @type {any} */
    let expectedVal = {
      booleanField: false,
      floatVal: 12.33,
      someInt: 7,
      stringArr: ['masquerade', 'orm', 'best', 'orm'],
      unstructuredData: 'random data'
    }

    let currentTime

    await t.test('non-relational non-arrays', async () => {
      currentTime = new Date()
      nonRelationalTest[0].boolean = false

      assert.strictEqual(testInstanceChangeLog.boolean, false)
      assert.strictEqual(validateUpdatedAt(testInstanceChangeLog.updatedAt, currentTime), true)

      currentTime = new Date()
      nonRelationalTest[0].json = {
        booleanField: false,
        floatVal: 12.33,
        someInt: 7,
        stringArr: ['masquerade', 'orm']
      }

      nonRelationalTest[0].json.unstructuredData = 'random data'
      nonRelationalTest[0].json.stringArr.push('best', 'orm')

      assert.deepStrictEqual(testInstanceChangeLog.json, expectedVal)
      assert.strictEqual(validateUpdatedAt(testInstanceChangeLog.updatedAt, currentTime), true)
    })

    await t.test('non-relational arrays', async () => {
      currentTime = new Date()
      nonRelationalTest[0].stringArr = ['good', 'day']
      nonRelationalTest[0].stringArr.push('sir')

      assert.deepStrictEqual(testInstanceChangeLog.stringArr, ['good', 'day', 'sir'])
      assert.strictEqual(validateUpdatedAt(testInstanceChangeLog.updatedAt, currentTime), true)

      currentTime = new Date()
      nonRelationalTest[0].jsonArr.push({
        someInt: 7,
        booleanField: false,
        floatVal: 7.7,
        stringArr: ['hola', 'mundo']
      })

      expectedVal =
        '[{"booleanField":true,"floatVal":15.7,"someInt":5,"stringArr":["a","b","c"]},{"someInt":7,"booleanField":false,"floatVal":7.7,"stringArr":["hola","mundo"]}]'

      assert.deepStrictEqual(testInstanceChangeLog.jsonArr, expectedVal)
      assert.strictEqual(validateUpdatedAt(testInstanceChangeLog.updatedAt, currentTime), true)

      currentTime = new Date()
      nonRelationalTest[0].jsonArr[0].stringArr = ['someString']

      expectedVal =
        '[{"booleanField":true,"floatVal":15.7,"someInt":5,"stringArr":["someString"]},{"someInt":7,"booleanField":false,"floatVal":7.7,"stringArr":["hola","mundo"]}]'

      assert.deepStrictEqual(testInstanceChangeLog.jsonArr, expectedVal)
      assert.strictEqual(validateUpdatedAt(testInstanceChangeLog.updatedAt, currentTime), true)
    })
  })

  let undefinedTest = await House.find({ relations: { owner: true, tenants: true } })

  const lastHouse = undefinedTest[undefinedTest.length - 1]
  lastHouse.owner = undefined
  lastHouse.tenants = undefined

  undefinedTest = await House.find({
    where: { id: lastHouse.id },
    relations: { owner: true, tenants: true }
  })

  await t.test('assigning undefined values to relational props', async () => {
    assert.strictEqual(undefinedTest[0].owner, undefined)
    assert.deepStrictEqual(undefinedTest[0].tenants, [])
  })

  await t.test('presave new instances', async (t) => {
    await t.test('new instance proxies communicate with dbChanges correctly', async () => {
      const preSaveChanges = new NonRelationalClass2()
      preSaveChanges.stringArr.push('please rewrite this in rust')
      preSaveChanges.bigint = 12n

      const preSaveChangesObj =
        dbChanges.NonRelationalClass2[preSaveChanges.id.toString()]

      assert.deepStrictEqual(
        preSaveChangesObj.stringArr,
        ['hello', 'world', 'please rewrite this in rust']
      )
      assert.deepStrictEqual(preSaveChangesObj.bigint, 12n)
    })
  })
})


test('test 2 - promises and instance logging', async (t) => {

  await t.test('overwriting promises without loading', async (t) => {
    let firstRelationalTest = (await House.find({ where: { id: 1 } }))[0]
    const mrClean = (firstRelationalTest.owner = new Person('Mr Clean', 30))
    firstRelationalTest.tenants = [mrClean, new Person('Mrs Clean', 24)]

    firstRelationalTest = (await House.find({ where: { id: 1 } }))[0]
    await initPostgresDb(configObj, classes)

    firstRelationalTest = (
      await House.find({
        where: { id: 1 },
        relations: { owner: true, tenants: true }
      })
    )[0]

    await t.test('1-to-1 relational promise assignment', async () => {
      assert.strictEqual(firstRelationalTest?.owner?.fullName, 'Mr Clean')
    })

    await t.test('1-to-many relational promise assignment', async () => {
      assert.strictEqual(firstRelationalTest?.tenants?.length, 2)
      assert.strictEqual(firstRelationalTest.tenants[0].fullName, 'Mr Clean')
      assert.strictEqual(firstRelationalTest.tenants[1].fullName, 'Mrs Clean')
    })
  })

  await t.test('check instance logging', async (t) => {
    const original = (
      await House.find({
        where: { id: 2 },
        relations: { owner: true, tenants: true }
      })
    )[0]

    const sameInstance = (await House.find({ where: { id: 2 } }))[0]

    await t.test('instance logging is working correctly', async () => {
      assert.strictEqual(original === sameInstance, true)
    })
  })
})

test('test 3 - deletion', async (t) => {
  let house = (await House.find({
    relations:
    {
      owner:
        { children: true },
      tenants:
      {
        father: true,
        mother: true
      }
    },
    where: { id: 5 }
  }))[0]

  const father = house.owner
  const childrenCount = father?.children.length
  const tenantCount = house.tenants?.length
  //@ts-ignore
  let children = [...father?.children]
  const firstChild = children.shift()

  await t.test('deletion events - relational arrays', async () => {
    await firstChild.delete()
    //@ts-ignore
    assert.strictEqual(childrenCount - father?.children.length === 1, true)
    assert.strictEqual(father?.children.includes(firstChild), false)
  })

  await t.test('deletion events - 1-to-1 relation', async () => {
    await father?.delete()
    await House.find({})
    await initPostgresDb(configObj, classes)

    house = (await House.find({
      relations:
      {
        owner:
          { children: true },
        tenants:
        {
          father: true,
          mother: true,
          children: true
        }
      },
      where: { id: 5 }
    }))[0]

    const childrenIds = children.map(child => child.id)
    house.tenants && tenantCount && assert.strictEqual(tenantCount - house.tenants?.length , 2)
    assert.strictEqual(childrenIds.includes(firstChild.id), false)
    for (const person of house.tenants ?? []) assert.strictEqual(person.father, undefined)
  })
})

test.after(async () => {
  await resetPostgresDb(configObj.dbConnection)
  console.log('db reset')

  // @ts-ignore
  configObj.dbConnection.end()
})

