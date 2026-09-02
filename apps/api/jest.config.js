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
  // 30 s au lieu des 5 s par défaut : chaque suite HTTP démarre l'application
  // Nest complète, et sous contention CPU (build ou autre suite en parallèle)
  // ce démarrage seul dépassait 5 s — un échec « intermittent » qui n'en était
  // pas un (registre R-14). Un vrai blocage échoue toujours, seulement plus tard.
  testTimeout: 30_000,
  // Voir jest.setup.js : les tests ne lisent jamais les jeux versés localement.
  setupFiles: ["<rootDir>/../jest.setup.js"],
};
