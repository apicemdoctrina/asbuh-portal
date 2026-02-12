import js from "@eslint/js";
import globals from "globals";
import reactPlugin from "eslint-plugin-react";
import prettierConfig from "eslint-config-prettier";

export default [
  js.configs.recommended,
  prettierConfig,
  {
    files: ["apps/web/**/*.{js,jsx}"],
    plugins: { react: reactPlugin },
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: { react: { version: "18" } },
    rules: {
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",
      "react/jsx-uses-react": "error",
      "react/jsx-uses-vars": "error",
    },
  },
  {
    files: ["apps/api/**/*.{js,jsx}"],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  {
    ignores: ["**/dist/", "**/build/", "**/node_modules/", "**/coverage/"],
  },
];
