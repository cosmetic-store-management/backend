import { SyntaxKind } from "ts-morph";
const AuthRule = {
    name: "Authentication Requirement",
    description: "Ensure routes that access req.user use the authenticate middleware",
    run(sourceFile) {
        const issues = [];
        if (!sourceFile.getFilePath().endsWith(".controller.ts")) {
            return issues;
        }
        const callExpressions = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);
        for (const callExpr of callExpressions) {
            const expression = callExpr.getExpression();
            if (expression.getKind() === SyntaxKind.PropertyAccessExpression) {
                const propAccess = expression.asKindOrThrow(SyntaxKind.PropertyAccessExpression);
                const name = propAccess.getName();
                const objName = propAccess.getExpression().getText();
                if (objName === "router" && ["get", "post", "put", "patch", "delete"].includes(name)) {
                    const args = callExpr.getArguments();
                    let usesAuthenticate = false;
                    for (const arg of args) {
                        if (arg.getKind() === SyntaxKind.Identifier) {
                            const text = arg.getText();
                            if (text === "authenticate" || text === "optionalAuth" || text === "isAuthenticated") {
                                usesAuthenticate = true;
                                break;
                            }
                        }
                        if (arg.getKind() === SyntaxKind.CallExpression) {
                            const callText = arg.getText();
                            if (callText.startsWith("passport.authenticate")) {
                                usesAuthenticate = true;
                                break;
                            }
                        }
                    }
                    // Check if req.user is accessed inside the route handler
                    const lastArg = args[args.length - 1]; // usually catchAsync
                    let accessesReqUser = false;
                    if (lastArg) {
                        const propAccesses = lastArg.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression);
                        for (const pa of propAccesses) {
                            if (pa.getText() === "req.user" || pa.getText() === "req.user!") {
                                accessesReqUser = true;
                                break;
                            }
                        }
                    }
                    if (accessesReqUser && !usesAuthenticate) {
                        issues.push({
                            filePath: sourceFile.getFilePath(),
                            line: callExpr.getStartLineNumber(),
                            message: `Route handler ${name.toUpperCase()} accesses req.user but is missing 'authenticate' middleware.`,
                            severity: "error",
                        });
                    }
                }
            }
        }
        return issues;
    },
};
export default AuthRule;
