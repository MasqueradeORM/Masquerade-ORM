export function jsonGenerator() {
    return {
        booleanField: true,
        floatVal: 15.7,
        someInt: 5,
        stringArr: ['a', 'b', 'c']
    }
}

const nameArrMale = [
    "James",
    "John",
    "Robert",
    "Michael",
    "William",
    "David",
    "Richard",
    "Joseph",
    "Charles",
    "Thomas",
    "Daniel",
    "Matthew",
    "Anthony",
    "Mark",
    "Paul",
    "Steven",
    "Andrew",
    "Kenneth",
    "Joshua",
    "Kevin"
]

const nameArrFemale = [
    "Mary",
    "Patricia",
    "Jennifer",
    "Linda",
    "Elizabeth",
    "Barbara",
    "Susan",
    "Jessica",
    "Sarah",
    "Karen",
    "Nancy",
    "Lisa",
    "Margaret",
    "Betty",
    "Sandra",
    "Ashley",
    "Kimberly",
    "Emily",
    "Donna",
    "Michelle"
]

const surnames = [
    "Smith",
    "Johnson",
    "Williams",
    "Brown",
    "Jones",
    "Garcia",
    "Miller",
    "Davis",
    "Rodriguez",
    "Martinez"
]

export function arrayRandomPick(array) {
    return array[Math.floor(Math.random() * array.length)]
}

export function familyNameGenerator(/**@type {number}*/ familySize) {
    const familyNames = []
    let firstName = arrayRandomPick(nameArrMale)
    const surname = arrayRandomPick(surnames)
    familyNames.push(`${firstName} ${surname}`)
    firstName = arrayRandomPick(nameArrFemale)
    familyNames.push(`${firstName} ${surname}`)

    const childrenFirstNames = [...nameArrMale, ...nameArrFemale]
    for (let i = 0; i < familySize - 2; i++) familyNames.push(`${arrayRandomPick(childrenFirstNames)} ${surname}`)
    return familyNames
}

export function familyAgeGenerator(/**@type {number}*/ familySize) {
    const fatherAge = 18 + Math.floor(Math.random() * 20)
    const motherAge = 18 + Math.floor(Math.random() * 20)
    const familyAges = [fatherAge, motherAge]
    for (let i = 0; i < familySize - 2; i++) familyAges.push(1 + Math.floor(Math.random() * (Math.min(motherAge, fatherAge) - 18)))
    return familyAges
}

export function validateUpdatedAt(updatedAt, currentTime) {
    return updatedAt.getTime() - currentTime.getTime() >= 0
}

