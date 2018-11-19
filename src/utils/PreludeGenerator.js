/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import * as t from "@babel/types";
import { memberExpressionHelper } from "./babelhelpers.js";
import type {
  BabelNodeIdentifier,
  BabelNodeThisExpression,
  BabelNodeStatement,
  BabelNodeMemberExpression,
  BabelNodeExpression,
} from "@babel/types";
import { NameGenerator } from "./NameGenerator.js";
import buildTemplate from "@babel/template";
import invariant from "../invariant.js";

export const Placeholders = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const placeholderDefaultWhiteList = new Set(["global"]);
const placeholderWhitelist = new Set([...placeholderDefaultWhiteList, ...Placeholders]);
export const DisablePlaceholderSuffix = "// disable placeholders";

export class PreludeGenerator {
  constructor(debugNames: ?boolean, uniqueSuffix: ?string) {
    this.prelude = [];
    this.memoizedRefs = new Map();
    this.nameGenerator = new NameGenerator(new Set(), !!debugNames, uniqueSuffix || "", "_$");
    this.usesThis = false;
    this.declaredGlobals = new Set();
    this.nextInvariantId = 0;
    this._expressionTemplates = new Map();
  }

  prelude: Array<BabelNodeStatement>;
  memoizedRefs: Map<string, BabelNodeIdentifier>;
  nameGenerator: NameGenerator;
  usesThis: boolean;
  declaredGlobals: Set<string>;
  nextInvariantId: number;
  _expressionTemplates: Map<string, ({}) => BabelNodeExpression>;

  createNameGenerator(prefix: string): NameGenerator {
    return new NameGenerator(
      this.nameGenerator.forbiddenNames,
      this.nameGenerator.debugNames,
      this.nameGenerator.uniqueSuffix,
      prefix
    );
  }

  convertStringToMember(str: string): BabelNodeIdentifier | BabelNodeThisExpression | BabelNodeMemberExpression {
    return str
      .split(".")
      .map(name => {
        if (name === "global") {
          return this.memoizeReference(name);
        } else if (name === "this") {
          return t.thisExpression();
        } else {
          return t.identifier(name);
        }
      })
      .reduce((obj, prop) => t.memberExpression(obj, prop));
  }

  globalReference(key: string, globalScope: boolean = false): BabelNodeIdentifier | BabelNodeMemberExpression {
    if (globalScope && t.isValidIdentifier(key)) return t.identifier(key);
    return memberExpressionHelper(this.memoizeReference("global"), key);
  }

  memoizeReference(key: string): BabelNodeIdentifier {
    let ref = this.memoizedRefs.get(key);
    if (ref) return ref;

    let init;
    if (key.includes("(") || key.includes("[")) {
      // Horrible but effective hack:
      // Some internal object have intrinsic names such as
      //    ([][Symbol.iterator]().__proto__.__proto__)
      // and
      //    RegExp.prototype[Symbol.match]
      // which get turned into a babel node here.
      // TODO: We should properly parse such a string, and memoize all references in it separately.
      // Instead, we just turn it into a funky identifier, which Babel seems to accept.
      init = t.identifier(key);
    } else if (key === "global") {
      this.usesThis = true;
      init = t.thisExpression();
    } else {
      let i = key.lastIndexOf(".");
      if (i === -1) {
        init = t.memberExpression(this.memoizeReference("global"), t.identifier(key));
      } else {
        init = t.memberExpression(this.memoizeReference(key.substr(0, i)), t.identifier(key.substr(i + 1)));
      }
    }
    ref = t.identifier(this.nameGenerator.generate(key));
    this.prelude.push(t.variableDeclaration("var", [t.variableDeclarator(ref, init)]));
    this.memoizedRefs.set(key, ref);
    return ref;
  }

  buildExpression(code: string, templateArguments: {}): BabelNodeExpression {
    let disablePlaceholders = false;
    const key = code;
    let template = this._expressionTemplates.get(key);
    if (template === undefined) {
      if (code.endsWith(DisablePlaceholderSuffix)) {
        code = code.substring(0, code.length - DisablePlaceholderSuffix.length);
        disablePlaceholders = true;
      }

      template = buildTemplate(code, {
        placeholderPattern: false,
        placeholderWhitelist: disablePlaceholders ? placeholderDefaultWhiteList : placeholderWhitelist,
      });

      this._expressionTemplates.set(key, template);
    }

    if (code.includes("global"))
      templateArguments = Object.assign(
        {
          global: this.memoizeReference("global"),
        },
        templateArguments
      );

    let result = (template(templateArguments): any).expression;
    invariant(result !== undefined, "Code does not represent an expression: " + code);
    return result;
  }
}
