/** Configuration Jest pour les tests de contrat/sécurité (ts-jest). */
module.exports = {
  moduleFileExtensions: ["js", "json", "ts"],
  rootDir: "src",
  testRegex: ".*\\.spec\\.ts$",
  transform: {
    "^.+\\.ts$": ["ts-jest", { tsconfig: "<rootDir>/../tsconfig.json" }],
  },
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
  },
  testEnvironment: "node",
  // Voir jest.setup.js : les tests ne lisent jamais les jeux versés localement.
  setupFiles: ["<rootDir>/../jest.setup.js"],
};
