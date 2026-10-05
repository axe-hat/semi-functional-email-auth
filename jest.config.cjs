/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: "jsdom",
  roots: ["<rootDir>/tests"],
  setupFilesAfterEnv: ["<rootDir>/tests/setup.ts"],
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        tsconfig: {
          module: "CommonJS",
          moduleResolution: "Node10",
          jsx: "react-jsx",
          isolatedModules: true,
        },
      },
    ],
  },
  // Source imports use ".js" extensions (correct for ESM output); map them back to the TS files.
  moduleNameMapper: { "^(\\.{1,2}/.*)\\.js$": "$1" },
  collectCoverageFrom: ["src/**/*.{ts,tsx}", "!src/index.ts"],
  coverageThreshold: { global: { lines: 90, branches: 80, functions: 90, statements: 90 } },
};
