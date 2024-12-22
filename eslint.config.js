import globals from "globals";
import pluginJs from "@eslint/js";
import jsdoc from "eslint-plugin-jsdoc";


/** @type {import('eslint').Linter.Config[]} */
export default [
    {
        languageOptions: {
            globals: { ...globals.browser, ...globals.node }
        }
    },
    pluginJs.configs.recommended,
    {
        rules: {
            // 禁用驼峰命名.
            camelcase: "off",

            // 禁用 console.
            "no-console": "warn",

            // 强制严格比较.
            eqeqeq: ["error", "always"],

            // 强制使用大括号.
            curly: "error",

            // 禁止使用未定义变量.
            "no-undef": "error",

            // 禁止使用未使用的变量.
            "no-unused-vars": "warn",

            // 强制使用分号结尾.
            semi: ["error", "always"],

            // 禁止使用 var.
            "no-var": "error",

            // 使用4个空格的tab, switch语句缩进1个tab.
            indent: ["error", 4, { "SwitchCase": 1 }],

            // 强制使用const定义不会被修改的变量.
            "prefer-const": "error",

            // switch语句必须有default.
            "default-case": "error",
        }
    },
    {
        // JSdoc规则.
        files: ["*.js"],
        plugins: { jsdoc },
        rules: {
            "jsdoc/require-jsdoc": "warn", // 要求jsdoc.
            "jsdoc/require-param": "warn", // 要求参数.
            "jsdoc/require-returns": "warn", // 要求返回值.
        }
    }
];