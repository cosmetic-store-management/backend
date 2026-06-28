import { SyntaxKind } from "ts-morph";
const ErrorHandlingRule = {
    name: "Error Handling (CatchAsync)",
    description: "Ensure all route handlers use catchAsync or contain a try-catch block",
    run(sourceFile) {
        const issues = [];
        // Only apply to controller files
        if (!sourceFile.getFilePath().endsWith(".controller.ts")) {
            return issues;
        }
        // Find all call expressions on 'router' (e.g., router.get, router.post)
        const callExpressions = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);
        for (const callExpr of callExpressions) {
            const expression = callExpr.getExpression();
            if (expression.getKind() === SyntaxKind.PropertyAccessExpression) {
                const propAccess = expression.asKindOrThrow(SyntaxKind.PropertyAccessExpression);
                const name = propAccess.getName();
                const objName = propAccess.getExpression().getText();
                if (objName === "router" && ["get", "post", "put", "patch", "delete"].includes(name)) {
                    // This is a route definition. Let's check its arguments.
                    const args = callExpr.getArguments();
                    let hasCatchAsync = false;
                    for (const arg of args) {
                        if (arg.getKind() === SyntaxKind.CallExpression) {
                            const argCall = arg.asKindOrThrow(SyntaxKind.CallExpression);
                            if (argCall.getExpression().getText() === "catchAsync") {
                                hasCatchAsync = true;
                                break;
                            }
                        }
                    }
                    if (!hasCatchAsync) {
                        // It might have try/catch inside an async function directly
                        const lastArg = args[args.length - 1];
                        let hasTryCatch = false;
                        // Ignore if the last argument is just an identifier (function reference) 
                        // since it's too complex to trace its definition here.
                        if (lastArg && lastArg.getKind() === SyntaxKind.Identifier) {
                            hasTryCatch = true;
                        }
                        if (lastArg && (lastArg.getKind() === SyntaxKind.ArrowFunction || lastArg.getKind() === SyntaxKind.FunctionExpression)) {
                            const body = lastArg.getBody();
                            if (body && body.getKind() === SyntaxKind.Block) {
                                const tryStatements = body.getDescendantsOfKind(SyntaxKind.TryStatement);
                                if (tryStatements.length > 0) {
                                    hasTryCatch = true;
                                }
                            }
                        }
                        // Also ignore simple OAuth redirects like passport.authenticate where the last argument is not a function
                        if (lastArg && lastArg.getKind() === SyntaxKind.CallExpression && lastArg.getText().startsWith("passport.authenticate")) {
                            hasTryCatch = true; // Not literally, but it's safe
                        }
                        if (!hasTryCatch) {
                            issues.push({
                                filePath: sourceFile.getFilePath(),
                                line: callExpr.getStartLineNumber(),
                                message: `Route handler ${name.toUpperCase()} missing catchAsync wrapper or try/catch block.`,
                                severity: "error",
                            });
                        }
                    }
                }
            }
        }
        return issues;
    },
};
export default ErrorHandlingRule;
