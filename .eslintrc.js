module.exports = {
    env: {
        browser: true,
        jest: true,
        node: true,
    },
    extends: [
        "eslint:recommended",
        "plugin:@typescript-eslint/eslint-recommended",
        "plugin:@typescript-eslint/recommended",
        "plugin:@typescript-eslint/recommended-requiring-type-checking",
        "prettier",
    ],
    parser: "@typescript-eslint/parser",
    parserOptions: {
        ecmaVersion: 2018,
        project: "./tsconfig.json",
        sourceType: "module",
    },
    plugins: ["@typescript-eslint"],
    root: true,
    rules: {
        "no-console": "warn",
    },
    overrides: [
        {
            files: ["**/*.test.ts?(x)"],
            rules: {
                // Disable rules that are lower value in tests
                "@typescript-eslint/explicit-function-return-type": "off",
                "@typescript-eslint/no-explicit-any": "off",
                "@typescript-eslint/no-non-null-assertion": "off",
                "@typescript-eslint/no-unsafe-assignment": "off",
                "@typescript-eslint/no-unsafe-call": "off",
                "@typescript-eslint/no-unsafe-member-access": "off",
                "@typescript-eslint/no-unsafe-return": "off",
                "@typescript-eslint/no-var-requires": "off",
                "@typescript-eslint/restrict-template-expressions": "off",
            },
        },
    ],
};
