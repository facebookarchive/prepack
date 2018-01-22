/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import { Realm } from "../realm.js";
import { ObjectValue, ECMAScriptSourceFunctionValue } from "../values/index.js";
import { ResidualHeapSerializer } from "./ResidualHeapSerializer.js";
import { withBytecodeComponentEffects } from "../react/bytecode.js";
import * as t from "babel-types";
import type { BabelNodeExpression } from "babel-types";
import type { ReactBytecodeTree } from "./types.js";
import { replaceThisReferences } from "../react/utils.js";
import { Generator } from "../utils/generator.js";
import invariant from "../invariant.js";
import { Get } from "../methods/index.js";

export class ResidualReactBytecodeSerializer {
  constructor(
    realm: Realm,
    residualHeapSerializer: ResidualHeapSerializer,
    reactBytecodeTrees: Map<ObjectValue, ReactBytecodeTree>
  ) {
    this.realm = realm;
    this.residualHeapSerializer = residualHeapSerializer;
    this.reactBytecodeTrees = reactBytecodeTrees;
  }
  realm: Realm;
  residualHeapSerializer: ResidualHeapSerializer;
  reactBytecodeTrees: Map<ObjectValue, ReactBytecodeTree>;

  serializeReactBytecodeTree(reactBytecodeTree: ReactBytecodeTree): BabelNodeExpression {
    let { rootBytecodeComponent } = reactBytecodeTree;
    let { instances, effects, instructions, instructionsFunc, nodeValue, slotsFunc, values } = rootBytecodeComponent;

    return withBytecodeComponentEffects(this.realm, effects, generator => {
      // handle component instances
      for (let { additionalProperties, existingStatements, func, prototype } of instances) {
        let component = Get(this.realm, prototype, "constructor");
        invariant(component instanceof ECMAScriptSourceFunctionValue);
        let meta = this.realm.react.classComponentMeta.get(component);
        invariant(meta);
        let additionalStatements = [];

        // as we mark assignments as abstract, we need to serialize the original values
        for (let [propertyName, value] of additionalProperties) {
          if (meta.thisAssignments.has(propertyName)) {
            if (this.residualHeapSerializer.residualValues.has(value)) {
              let identifier = this.residualHeapSerializer.serializeValue(value);
              additionalStatements.push(
                t.expressionStatement(
                  t.assignmentExpression(
                    "=",
                    t.memberExpression(t.thisExpression(), t.identifier(propertyName)),
                    identifier
                  )
                )
              );
            }
          }
        }
        // add all of the properties to the start of the constructor body array
        func.$ECMAScriptCode.body = [...additionalStatements, ...existingStatements];
      }

      let returnNodes = [];
      let slotStatements = this.residualHeapSerializer.withGeneratorScope(generator, newBody => {
        let oldCurBody = this.residualHeapSerializer.currentFunctionBody;
        this.residualHeapSerializer.currentFunctionBody = newBody;
        let context = this.residualHeapSerializer.getContext();
        generator.serialize(context);
        for (let value of values) {
          returnNodes.push(this.residualHeapSerializer.serializeValue(value));
        }
        this.residualHeapSerializer.currentFunctionBody = oldCurBody;
      });

      slotStatements.push(t.returnStatement(t.arrayExpression(returnNodes)));
      slotsFunc.$ECMAScriptCode.body = slotStatements;
      replaceThisReferences(slotsFunc.$ECMAScriptCode);

      let instructionsGenerator = new Generator(this.realm);
      let instructionStatements = this.residualHeapSerializer.withGeneratorScope(instructionsGenerator, newBody => {
        let oldCurBody = this.residualHeapSerializer.currentFunctionBody;
        this.residualHeapSerializer.currentFunctionBody = newBody;
        let instructionsNode = this.residualHeapSerializer.serializeValue(instructions);
        this.residualHeapSerializer.emitter.emit(t.returnStatement(instructionsNode));
        this.residualHeapSerializer.currentFunctionBody = oldCurBody;
      });
      instructionsFunc.$ECMAScriptCode.body = instructionStatements;
      return this.residualHeapSerializer.serializeValueObject(nodeValue);
    });
  }
}
