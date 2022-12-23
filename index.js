import {CommonFlags, Node, NodeKind, ParameterKind, ElementKind} from "assemblyscript"
import {Transform} from "assemblyscript/transform"

const INTERNAL_TRANSFORM_NAME = "LunaticInternalTransformInterface"
const METHOD_NAMES = ["__lunaticSerialize"]

export default class LunaticTransform extends Transform {
    afterParse({sources}) {
        for (const {statements} of sources) {
            this.traverseStatements(statements)
        }
    }

    traverseStatements(statements) {
        for (const statement of statements) {
            if (statement.kind === NodeKind.ClassDeclaration) {
                this.createSerializeMethod(statement)
            } else if (statement.kind === NodeKind.NamespaceDeclaration) {
                this.traverseStatements(statement.members)
            }
        }
    }

    createSerializeMethod({members, name: {range}, isGeneric}) {
        const bodyStatements = members
            .filter(member => member.is(CommonFlags.Instance) && member.kind === NodeKind.FieldDeclaration)
            .map(({name}) => {
                const {range, text} = name
                // ser.write(this.PROP, offsetof<this>("PROP"));
                return Node.createExpressionStatement(
                    Node.createCallExpression(
                        Node.createPropertyAccessExpression(
                            Node.createIdentifierExpression("ser", range),
                            Node.createIdentifierExpression("write", range),
                            range
                        ),
                        null,
                        [
                            Node.createPropertyAccessExpression(
                                Node.createThisExpression(range),
                                name,
                                range
                            ),
                            Node.createCallExpression(
                                Node.createIdentifierExpression("offsetof", range),
                                [
                                    Node.createNamedType(
                                        Node.createSimpleTypeName("this", range),
                                        null,
                                        false,
                                        range
                                    )
                                ],
                                [Node.createStringLiteralExpression(text, range)],
                                range
                            )
                        ],
                        range
                    )
                )
            })

        // if (isDefined(super.__lunaticSerialize)) super.__lunaticSerialize(ser);
        const superFunction = Node.createPropertyAccessExpression(
            Node.createSuperExpression(range),
            Node.createIdentifierExpression("__lunaticSerialize", range),
            range
        )
        const ser = Node.createIdentifierExpression("ser", range)

        bodyStatements.push(
            Node.createIfStatement(
                Node.createCallExpression(
                    Node.createIdentifierExpression("isDefined", range),
                    null,
                    [superFunction],
                    range
                ),
                Node.createExpressionStatement(
                    Node.createCallExpression(
                        superFunction,
                        null,
                        [ser],
                        range
                    )
                ),
                null,
                range
            )
        )

        // __lunaticSerialize<T>(ser: T): void { ... }
        const flags = CommonFlags.Public | CommonFlags.Instance | CommonFlags.Generic | (isGeneric && CommonFlags.GenericContext)
        members.push(
            Node.createMethodDeclaration(
                Node.createIdentifierExpression("__lunaticSerialize", range),
                null,
                flags,
                [
                    Node.createTypeParameter(
                        Node.createIdentifierExpression("T", range),
                        null,
                        null,
                        range
                    ),
                ],
                Node.createFunctionType(
                    [
                        Node.createParameter(
                            ParameterKind.Default,
                            ser,
                            Node.createNamedType(
                                Node.createSimpleTypeName("T", range),
                                null,
                                false,
                                range
                            ),
                            null,
                            range
                        )
                    ],
                    Node.createNamedType(
                        Node.createSimpleTypeName("void", range),
                        null,
                        false,
                        range
                    ),
                    null,
                    false,
                    range
                ),
                Node.createBlockStatement(bodyStatements, range),
                range
            )
        )
    }

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