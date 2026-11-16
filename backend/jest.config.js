module.exports = {
  testEnvironment: "node",
  roots: ["<rootDir>/src", "<rootDir>/test"],
  testRegex: "\\.spec\\.ts$",
  transform: { "^.+\\.ts$": "@swc/jest" },
  collectCoverageFrom: ["src/**/*.ts", "!src/**/*.spec.ts"],
  coverageProvider: "v8",
  coverageThreshold: {
    global: { statements: 80, branches: 80, functions: 80, lines: 80 },
  },
};
