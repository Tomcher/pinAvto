// @ts-check

import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist/", // exclude specific folder
      "**/*.js", // exclude all JavaScript files
    ],
  },
  {
    files: ["src/**/*.ts"],
    extends: [eslint.configs.recommended, tseslint.configs.recommended],
  },
);
