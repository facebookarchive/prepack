// Adapted from React Native .eslintrc.
// However, at this time, some rules have been disabled to ease the transition

{
  "parser": "babel-eslint",

  "plugins": [
    "flowtype",
    "header",
    "flow-header",
  ],

  "ecmaFeatures": {
    "jsx": true
  },

  "env": {
    "es6": true,
    "jasmine": true,
  },

  "globals": {
    "console": false,
    "process": false,
    "require": false,
    "setTimeout": false,
    "setInterval": false,
    "clearTimeout": false,
    "clearInterval": false,
    "__dirname": false,
    "Set": false
  },

  "rules": {
    "comma-dangle": 0,               // disallow trailing commas in object literals
    "no-cond-assign": 2,             // disallow assignment in conditional expressions
    "no-console": 0,                 // disallow use of console (off by default in the node environment)
    "no-const-assign": 2,            // disallow assignment to const-declared variables
    "no-constant-condition": 0,      // disallow use of constant expressions in conditions
    "no-control-regex": 2,           // disallow control characters in regular expressions
    "no-debugger": 2,                // disallow use of debugger
    "no-dupe-keys": 2,               // disallow duplicate keys when creating object literals
    "no-empty": 0,                   // disallow empty statements
    "no-ex-assign": 2,               // disallow assigning to the exception in a catch block
    "no-extra-boolean-cast": 2,      // disallow double-negation boolean casts in a boolean context
    "no-extra-parens": 0,            // disallow unnecessary parentheses (off by default)
    "no-extra-semi": 2,              // disallow unnecessary semicolons
    "no-func-assign": 2,             // disallow overwriting functions written as function declarations
    "no-inner-declarations": 0,      // disallow function or variable declarations in nested blocks
    "no-invalid-regexp": 2,          // disallow invalid regular expression strings in the RegExp constructor
    "no-negated-in-lhs": 2,          // disallow negation of the left operand of an in expression
    "no-obj-calls": 2,               // disallow the use of object properties of the global object (Math and JSON) as functions
    "no-regex-spaces": 2,            // disallow multiple spaces in a regular expression literal
    "no-reserved-keys": 0,           // disallow reserved words being used as object literal keys (off by default)
    "no-sparse-arrays": 2,           // disallow sparse arrays
    // "no-unreachable": 1,             // disallow unreachable statements after a return, throw, continue, or break statement
    "use-isnan": 2,                  // disallow comparisons with the value NaN
    "valid-jsdoc": 0,                // Ensure JSDoc comments are valid (off by default)
    "valid-typeof": 2,               // Ensure that the results of typeof are compared against a valid string
    "no-var": 2,

  // Best Practices
  // These are rules designed to prevent you from making mistakes. They either prescribe a better way of doing something or help you avoid footguns.

    "block-scoped-var": 0,           // treat var statements as if they were block scoped (off by default)
    "complexity": 0,                 // specify the maximum cyclomatic complexity allowed in a program (off by default)
    "consistent-return": 0,          // require return statements to either always or never specify values
    // "curly": 1,                      // specify curly brace conventions for all control statements
    "default-case": 2,               // require default case in switch statements (off by default)
    "dot-notation": 2,               // encourages use of dot notation whenever possible
    "eqeqeq": [2, "allow-null"],     // require the use of === and !==
    "guard-for-in": 0,               // make sure for-in loops have an if statement (off by default)
    "no-alert": 2,                   // disallow the use of alert, confirm, and prompt
    "no-caller": 2,                  // disallow use of arguments.caller or arguments.callee
    "no-div-regex": 2,               // disallow division operators explicitly at beginning of regular expression (off by default)
    "no-else-return": 0,             // disallow else after a return in an if (off by default)
    "no-eq-null": 0,                 // disallow comparisons to null without a type-checking operator (off by default)
    "no-eval": 2,                    // disallow use of eval()
    "no-extend-native": 2,           // disallow adding to native types
    "no-extra-bind": 2,              // disallow unnecessary function binding
    "no-fallthrough": 2,             // disallow fallthrough of case statements
    "no-floating-decimal": 2,        // disallow the use of leading or trailing decimal points in numeric literals (off by default)
    "no-implicit-globals": 2,
    "no-implied-eval": 2,            // disallow use of eval()-like methods
    "no-invalid-this": 2,
    "no-labels": 0,                  // disallow use of labeled statements
    "no-iterator": 2,                // disallow usage of __iterator__ property
    "no-lone-blocks": 2,             // disallow unnecessary nested blocks
    "no-loop-func": 0,               // disallow creation of functions within loops
    "no-multi-str": 0,               // disallow use of multiline strings
    "no-native-reassign": 0,         // disallow reassignments of native objects
    "no-new": 2,                     // disallow use of new operator when not part of the assignment or comparison
    "no-new-func": 2,                // disallow use of new operator for Function object
    "no-new-wrappers": 2,            // disallows creating new instances of String,Number, and Boolean
    "no-octal": 2,                   // disallow use of octal literals
    "no-octal-escape": 2,            // disallow use of octal escape sequences in string literals, such as var foo = "Copyright \251";
    "no-proto": 2,                   // disallow usage of __proto__ property
    "no-redeclare": 2,               // disallow declaring the same variable more then once
    "no-return-assign": 2,           // disallow use of assignment in return statement
    "no-script-url": 2,              // disallow use of javascript: urls.
    "no-self-assign": 2,
    "no-self-compare": 2,            // disallow comparisons where both sides are exactly the same (off by default)
    "no-sequences": 2,               // disallow use of comma operator
    "no-throw-literal": 2,
    "no-unused-expressions": 0,      // disallow usage of expressions in statement position
    "no-void": 2,                    // disallow use of void operator (off by default)
    "no-warning-comments": 0,        // disallow usage of configurable warning terms in comments": 1,                        // e.g. TODO or FIXME (off by default)
    "no-with": 2,                    // disallow use of the with statement
    "radix": 2,                      // require use of the second argument for parseInt() (off by default)
    "semi-spacing": 2,               // require a space after a semi-colon
    "vars-on-top": 0,                // requires to declare all vars on top of their containing scope (off by default)
    "wrap-iife": 0,                  // require immediate function invocation to be wrapped in parentheses (off by default)
    "yoda": 2,                       // require or disallow Yoda conditions

  // Variables
  // These rules have to do with variable declarations.

    "no-catch-shadow": 2,            // disallow the catch clause parameter name being the same as a variable in the outer scope (off by default in the node environment)
    "no-delete-var": 2,              // disallow deletion of variables
    "no-label-var": 2,               // disallow labels that share a name with a variable
    "no-shadow": 2,                  // disallow declaration of variables already declared in the outer scope
    "no-shadow-restricted-names": 2, // disallow shadowing of names such as arguments
    "no-undef": 2,                   // disallow use of undeclared variables unless mentioned in a /*global */ block
    "no-undefined": 0,               // disallow use of undefined variable (off by default)
    "no-undef-init": 2,              // disallow use of undefined when initializing variables
    "no-unused-vars": [2, {"vars": "all", "args": "none"}], // disallow declaration of variables that are not used in the code
    "no-use-before-define": 0,       // disallow use of variables before they are defined

  // Node.js
  // These rules are specific to JavaScript running on Node.js.

    "handle-callback-err": 2,        // enforces error handling in callbacks (off by default) (on by default in the node environment)
    "no-mixed-requires": 2,          // disallow mixing regular variable and require declarations (off by default) (on by default in the node environment)
    "no-new-require": 2,             // disallow use of new operator with the require function (off by default) (on by default in the node environment)
    "no-path-concat": 2,             // disallow string concatenation with __dirname and __filename (off by default) (on by default in the node environment)
    "no-process-exit": 0,            // disallow process.exit() (on by default in the node environment)
    "no-restricted-modules": 2,      // restrict usage of specified node modules (off by default)
    "no-sync": 0,                    // disallow use of synchronous methods (off by default)

  // Stylistic Issues
  // These rules are purely matters of style and are quite subjective.

    "key-spacing": 2,
    "keyword-spacing": 2,            // enforce spacing before and after keywords
    "jsx-quotes": [2, "prefer-double"],
    "comma-spacing": 2,
    "comma-style": 2,
    "no-multi-spaces": 0,
    "brace-style": 2,                // enforce one true brace style (off by default)
    "camelcase": 0,                  // require camel case names
    "consistent-this": [0, "self"],            // enforces consistent naming when capturing the current execution context (off by default)
    "eol-last": 2,                   // enforce newline at the end of file, with no multiple empty lines
    "func-names": 0,                 // require function expressions to have a name (off by default)
    "func-name-matching": 2,
    "func-call-spacing": 2,
    "func-style": 0,                 // enforces use of function declarations or expressions (off by default)
    "new-cap": [2, { "capIsNew": false }],                    // require a capital letter for constructors
    "new-parens": 2,                 // disallow the omission of parentheses when invoking a constructor with no arguments
    "no-nested-ternary": 0,          // disallow nested ternary expressions (off by default)
    "no-array-constructor": 2,       // disallow use of the Array constructor
    "no-lonely-if": 0,               // disallow if as the only statement in an else block (off by default)
    "no-new-object": 2,              // disallow use of the Object constructor
    "no-spaced-func": 2,             // disallow space between function identifier and application
    "no-tabs": 2,
    "no-ternary": 0,                 // disallow the use of ternary operators (off by default)
    "no-trailing-spaces": 2,         // disallow trailing whitespace at the end of lines
    "no-underscore-dangle": 0,       // disallow dangling underscores in identifiers
    "no-mixed-spaces-and-tabs": 2,   // disallow mixed spaces and tabs for indentation
    // "quotes": [1, "single", "avoid-escape"], // specify whether double or single quotes should be used
    "quote-props": 0,                // require quotes around object literal property names (off by default)
    "semi": 2,                       // require or disallow use of semicolons instead of ASI
    "sort-vars": 0,                  // sort variables within the same declaration block (off by default)
    "object-curly-spacing": [2, "always"],
    "array-bracket-spacing": 2,
    "computed-property-spacing": 2,
    "space-in-parens": 2,            // require or disallow spaces inside parentheses (off by default)
    "space-infix-ops": 2,            // require spaces around operators
    "space-unary-ops": [2, { "words": true, "nonwords": false }], // require or disallow spaces before/after unary operators (words on by default, nonwords off by default)
    "max-nested-callbacks": 0,       // specify the maximum depth callbacks can be nested (off by default)
    "one-var": 0,                    // allow just one var statement per function (off by default)
    "wrap-regex": 0,                 // require regex literals to be wrapped in parentheses (off by default)

  // Legacy
  // The following rules are included for compatibility with JSHint and JSLint. While the names of the rules may not match up with the JSHint/JSLint counterpart, the functionality is the same.

    "max-depth": 0,                  // specify the maximum depth that blocks can be nested (off by default)
    "max-len": 0,                    // specify the maximum length of a line in your program (off by default)
    "max-params": 0,                 // limits the number of parameters that can be used in the function declaration. (off by default)
    "max-statements": 0,             // specify the maximum number of statement allowed in a function (off by default)
    "no-bitwise": 0,                 // disallow use of bitwise operators (off by default)
    "no-plusplus": 0,                // disallow use of unary operators, ++ and -- (off by default)

  // Flow
    "flowtype/boolean-style": [2, "boolean"], // a problem is raised when using bool instead of boolean
    "flowtype/generic-spacing": [2, "never"],
    "flowtype/space-before-type-colon": [2, "never"],
    "flowtype/space-before-generic-bracket": [2, "never"],
    "flowtype/space-after-type-colon": [2, "always"],
    "flowtype/no-dupe-keys": 2,
    "flowtype/union-intersection-spacing": [2, "always"],
    "flowtype/no-weak-types": [2, {"any": false, "Object": true, "Function": false}],
    "flow-header/flow-header": 2,

  // Headers
    "header/header": [2, "block", [
      "*",
      " * Copyright (c) 2017-present, Facebook, Inc.",
      " * All rights reserved.",
      " *",
      " * This source code is licensed under the BSD-style license found in the",
      " * LICENSE file in the root directory of this source tree. An additional grant",
      " * of patent rights can be found in the PATENTS file in the same directory.",
      " ",
      ]
    ],
  }
}
