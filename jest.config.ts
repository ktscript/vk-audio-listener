import type { Config } from "@jest/types"

const config: Config.InitialOptions = {
    cache: false,
    verbose: false,
    globals: {
        'ts-jest': {
            tsconfig: 'tsconfig.json',
        },
    },
    collectCoverage: true,
    logHeapUsage: true,
    maxWorkers: 2,
    preset: "ts-jest",
    testTimeout: 10_000,
    testEnvironment: "node",
    testMatch: ["<rootDir>/test/*.test.ts"]
}

export default config;