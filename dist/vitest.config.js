import { defineConfig } from "vitest/config";
export default defineConfig({
    test: {
        globals: true,
        environment: "node",
        setupFiles: ["./tests/setup.ts"],
        include: ["tests/**/*.test.ts"],
        coverage: {
            provider: "v8",
            reporter: ["text", "lcov", "html"],
            include: [
                "app/modules/**/*.service.ts",
                "app/modules/**/*.repository.ts",
            ],
            exclude: ["app/modules/dev/**"],
        },
        // Run sequentially to avoid MongoDB transaction locks across tests
        fileParallelism: false,
        // Timeout cho integration tests (mongodb-memory-server cần thời gian khởi động)
        hookTimeout: 120_000,
        testTimeout: 15_000,
    },
});
