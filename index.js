import {ElementKind} from "assemblyscript"
import {Transform} from "assemblyscript/transform"

const INTERNAL_TRANSFORM_NAME = "LunaticInternalTransformInterface"
const METHOD_NAMES = ["__lunaticSerialize"]

export default class LunaticTransform extends Transform {
    afterInitialize(program) {
        const classes = [...program.elementsByName.values()]
            .filter(element => {
                return element.kind === ElementKind.ClassPrototype || element.kind === ElementKind.InterfacePrototype
            })

        const [internalInterface] = classes.splice(
            classes.findIndex(clazz => clazz.internalName.endsWith(INTERNAL_TRANSFORM_NAME)),
            1
        )

        const baseMethods = new Map()
        for (const name of METHOD_NAMES) {
            baseMethods.set(name, internalInterface.instanceMembers.get(name))
        }

        const {range} = internalInterface.declaration.name
        classes.forEach(clazz => {
            clazz.interfacePrototypes ??= []
            clazz.interfacePrototypes.push(internalInterface)

            const declaration = clazz.declaration
            declaration.implementsTypes ??= []
            declaration.implementsTypes.push(
                Node.createNamedType(
                    Node.createSimpleTypeName(INTERNAL_TRANSFORM_NAME, range),
                    null,
                    false,
                    range
                )
            )

            if (clazz.kind === ElementKind.InterfacePrototype) return

            for (const [name, method] of baseMethods) {
                method.unboundOverrides ??= new Set()
                method.unboundOverrides.add(
                    clazz.instanceMembers.get(name)
                )
            }
        })

        const resolvedInternalInterface = program.resolver.resolveClass(internalInterface, null)
        const resolvedClasses = [
            program.objectInstance,
            program.stringInstance,
            program.arrayBufferInstance,
            program.arrayBufferViewInstance
        ]
        resolvedClasses.forEach(clazz => clazz.addInterface(resolvedInternalInterface))
    }
}