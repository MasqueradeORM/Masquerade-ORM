import { familyAgeGenerator, familyNameGenerator } from "./miscFunctions.js"
import { Person, House } from "./testing-classes.js"

export function generateFamiliesAndHouses() {
    for (let i = 0; i < 30; i++) {
        const familySize = 3 + Math.floor(Math.random() * 7)
        const [fatherName, motherName, ...childrenNames] = familyNameGenerator(familySize)
        const [fatherAge, motherAge, ...childrenAges] = familyAgeGenerator(familySize)

        const father = new Person(fatherName, fatherAge)
        const mother = new Person(motherName, motherAge)
        const children = []
        for (const i in childrenNames) {
            const child = new Person(childrenNames[i], childrenAges[i], father, mother)
            children.push(child)
        }
        father.children.push(...children)
        mother.children.push(...children)
        new House(father, [father, mother, ...children])
    }
}
