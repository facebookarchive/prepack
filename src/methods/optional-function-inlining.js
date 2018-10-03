/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import { DeclarativeEnvironmentRecord, GlobalEnvironmentRecord, LexicalEnvironment } from "../environment.js";
import type { Realm, Effects } from "../realm.js";
import type { ECMAScriptFunctionValue } from "../values/index.js";
import { AbruptCompletion, JoinedNormalAndAbruptCompletions, SimpleNormalCompletion } from "../completions.js";
import {
  AbstractValue,
  AbstractObjectValue,
  ArrayValue,
  BoundFunctionValue,
  ConcreteValue,
  ECMAScriptSourceFunctionValue,
  FunctionValue,
  ObjectValue,
  PrimitiveValue,
  Value,
} from "../values/index.js";
import invariant from "../invariant.js";
import { Functions, Properties } from "../singletons.js";
import { PropertyDescriptor, cloneDescriptor } from "../descriptors.js";
import { createOperationDescriptor } from "../utils/generator.js";
import { Get } from "../methods/index.js";
import { InternalCall } from "./function.js";

function effectsArePure(realm: Realm, effects: Effects, F: ECMAScriptFunctionValue): boolean {
  if (realm.createdObjects === undefined) {
    return false;
  }
  for (let [binding] of effects.modifiedProperties) {
    let obj = binding.object;
    if (!effects.createdObjects.has(obj)) {
      return false;
    }
  }
  const baseEnv = F.$Environment;
  const bindingWasMutated = binding => {
    let env = baseEnv;
    let bindingName = binding.name;
    if (bindingName === "arguments") {
      return false;
    }
    if (env instanceof LexicalEnvironment) {
      while (env !== null) {
        let envRecord = env.environmentRecord;

        if (envRecord instanceof GlobalEnvironmentRecord) {
          for (let name of envRecord.$VarNames) {
            if (name === bindingName) {
              return true;
            }
          }
        } else if (envRecord instanceof DeclarativeEnvironmentRecord) {
          if (envRecord.bindings[bindingName] === binding) {
            return true;
          }
        }
        env = env.parent;
      }
    }
    return false;
  };

  for (let [binding] of effects.modifiedBindings) {
    if (bindingWasMutated(binding)) {
      return false;
    }
  }
  return true;
}

type OptionalInlinableStatus = "NEEDS_INLINING" | "OPTIONALLY_INLINE_WITH_CLONING" | "OPTIONALLY_INLINE";

function getOptionalInlinableStatus(
  realm: Realm,
  val: Value,
  funcEffects: Effects,
  validateNonObjectTemprals: boolean
): OptionalInlinableStatus {
  if (val instanceof ConcreteValue) {
    if (val instanceof PrimitiveValue) {
      return "OPTIONALLY_INLINE_WITH_CLONING";
    } else if (val instanceof ObjectValue) {
      // If the object was created outside of the function we're trying not to inline, then it's
      // always safe to optimize with this object. Although we return OPTIONALLY_INLINE_WITH_CLONING,
      // the logic inside the cloneOrModelValue will always return the same value if it's been created
      // outside of the function we're trying not to inline.
      if (funcEffects !== undefined && !funcEffects.createdObjects.has(val)) {
        return "OPTIONALLY_INLINE_WITH_CLONING";
      }
      // TODO eventually support temporalAlias, if it's possible
      if (val.temporalAlias !== undefined) {
        return "NEEDS_INLINING";
      }
      if (val.isIntrinsic()) {
        // TODO: should we inline in this case?
      }
      if (val.mightBeLeakedObject()) {
        // TODO: should we inline in this case?
      }
      // Check the status of the properties to see if any of them need inlining
      for (let [propName, binding] of val.properties) {
        if (binding && binding.descriptor) {
          // TODO support prototypes and callee
          if (propName === "callee" || propName === "prototype") {
            continue;
          }
          invariant(val instanceof ObjectValue);
          let propVal = Get(realm, val, propName);
          let propStatus = getOptionalInlinableStatus(realm, propVal, funcEffects, validateNonObjectTemprals);

          if (propStatus === "NEEDS_INLINING") {
            return "NEEDS_INLINING";
          }
        }
      }
      if (val instanceof ArrayValue) {
        if (val.$Prototype === realm.intrinsics.ArrayPrototype) {
          return "OPTIONALLY_INLINE_WITH_CLONING";
        }
        return "NEEDS_INLINING";
      } else if (val instanceof FunctionValue) {
        if (val.$Prototype === realm.intrinsics.FunctionPrototype) {
          if (val instanceof ECMAScriptSourceFunctionValue) {
            // TODO support some form of function inlining. It might be too expensive/complex to do other than
            // checking if simple functions have unbound reads to bindings already created in the environment.
            return "NEEDS_INLINING";
          } else if (val instanceof BoundFunctionValue) {
            let thisStatus = getOptionalInlinableStatus(realm, val.$BoundThis, funcEffects, validateNonObjectTemprals);

            if (thisStatus === "NEEDS_INLINING") {
              return "NEEDS_INLINING";
            }
            for (let boundArg of val.$BoundArguments) {
              let boundArgStatus = getOptionalInlinableStatus(realm, boundArg, funcEffects, validateNonObjectTemprals);

              if (boundArgStatus === "NEEDS_INLINING") {
                return "NEEDS_INLINING";
              }
            }
            let targetFunctionStatus = getOptionalInlinableStatus(
              realm,
              val.$BoundTargetFunction,
              funcEffects,
              validateNonObjectTemprals
            );

            if (targetFunctionStatus === "NEEDS_INLINING") {
              return "NEEDS_INLINING";
            }
            return "OPTIONALLY_INLINE_WITH_CLONING";
          }
        }
        return "NEEDS_INLINING";
      } else {
        if (val.$Prototype === realm.intrinsics.ObjectPrototype) {
          return "OPTIONALLY_INLINE_WITH_CLONING";
        }
        return "NEEDS_INLINING";
      }
    }
  } else if (val instanceof AbstractValue) {
    if (!funcEffects.createdAbstracts.has(val)) {
      return "OPTIONALLY_INLINE_WITH_CLONING";
    }
    if (val.kind === "conditional") {
      let [condValue, consequentVal, alternateVal] = val.args;
      invariant(condValue instanceof AbstractValue);
      let consequentStatus = getOptionalInlinableStatus(realm, consequentVal, funcEffects, validateNonObjectTemprals);
      let alternateStatus = getOptionalInlinableStatus(realm, alternateVal, funcEffects, validateNonObjectTemprals);

      if (
        consequentStatus === "NEEDS_INLINING" ||
        alternateStatus === "NEEDS_INLINING" ||
        consequentStatus !== alternateStatus
      ) {
        return "NEEDS_INLINING";
      } else if (consequentStatus === "OPTIONALLY_INLINE" && alternateStatus === "OPTIONALLY_INLINE") {
        return "OPTIONALLY_INLINE";
      } else {
        // We care if the condValue is temporal here, as it means we can't clone the conditional
        let condStatus = getOptionalInlinableStatus(realm, condValue, funcEffects, true);
        if (condStatus === "NEEDS_INLINING") {
          return "NEEDS_INLINING";
        }
        return "OPTIONALLY_INLINE_WITH_CLONING";
      }
    } else if (val.args.length > 0) {
      let optionalInlinableStatus;

      for (let arg of val.args) {
        // We care if the arg is temporal here, as it means we can't clone the abstract
        let status = getOptionalInlinableStatus(realm, arg, funcEffects, true);
        if (status === "NEEDS_INLINING") {
          return "NEEDS_INLINING";
        } else if (status === "OPTIONALLY_INLINE_WITH_CLONING") {
          optionalInlinableStatus = "OPTIONALLY_INLINE_WITH_CLONING";
        } else if (optionalInlinableStatus === undefined) {
          optionalInlinableStatus = status;
        }
      }
      invariant(optionalInlinableStatus !== undefined);
      return optionalInlinableStatus;
    }
    if (val instanceof AbstractObjectValue) {
      if (val.isTemporal()) {
        return "NEEDS_INLINING";
      }
      if (val.values.isTop() || val.values.isBottom()) {
        return "OPTIONALLY_INLINE";
      }
      debugger;
      for (let values of val.values.getElements()) {

      }
      return "OPTIONALLY_INLINE_WITH_CLONING";
    }
    if (validateNonObjectTemprals && val.isTemporal()) {
      return "NEEDS_INLINING";
    }
    // All abstract values with no args are treated as optionally inlinable.
    return "OPTIONALLY_INLINE";
  }
  return "NEEDS_INLINING";
}

function containsFunctionValue(
  realm: Realm,
  arg: Value,
  funcEffects: void | Effects,
  alreadyVisited?: Set<Value> = new Set()
): boolean {
  if (alreadyVisited.has(arg)) {
    return false;
  }
  alreadyVisited.add(arg);
  if (arg instanceof FunctionValue) {
    if (funcEffects !== undefined && !funcEffects.createdObjects.has(arg)) {
      return false;
    }
    return true;
  } else if (arg instanceof AbstractValue) {
    for (let abstractArg of arg.args) {
      if (containsFunctionValue(realm, abstractArg, funcEffects, alreadyVisited)) {
        return true;
      }
    }
  } else if (arg instanceof ObjectValue) {
    for (let [propName, binding] of arg.properties) {
      if (binding && binding.descriptor) {
        let val = Get(realm, arg, propName);
        if (containsFunctionValue(realm, val, funcEffects, alreadyVisited)) {
          return true;
        }
      }
    }
  }
  return false;
}

function argsContainFunctionValues(realm: Realm, argsList: Array<Value>): boolean {
  for (let arg of argsList) {
    if (containsFunctionValue(realm, arg)) {
      return true;
    }
  }
  return false;
}

function cloneObjectProperties(
  realm: Realm,
  clonedObject: ObjectValue,
  val: ObjectValue,
  intrinsicName: string,
  rootObject: void | ObjectValue,
  funcEffects: Effects
): void {
  clonedObject.refuseSerialization = true;
  for (let [propName, { descriptor }] of val.properties) {
    // TODO support prototypes and callee
    if (propName === "prototype" || propName === "callee") {
      continue;
    }
    invariant(descriptor instanceof PropertyDescriptor);
    let desc = cloneAndModelObjectPropertyDescriptor(
      realm,
      val,
      clonedObject,
      propName,
      descriptor,
      intrinsicName,
      rootObject || clonedObject,
      funcEffects
    );
    Properties.OrdinaryDefineOwnProperty(realm, clonedObject, propName, desc);
  }
  clonedObject.refuseSerialization = false;
}

function applyPostValueConfig(realm: Realm, value: Value, clonedValue: Value, rootObject: void | ObjectValue): void {
  if (clonedValue instanceof ObjectValue) {
    clonedValue.intrinsicNameGenerated = true;
  }
  if (value instanceof ObjectValue && clonedValue instanceof ObjectValue) {
    if (realm.react.reactProps.has(value)) {
      realm.react.reactProps.add(clonedValue);
    }
    if (value.mightBeFinalObject()) {
      clonedValue.makeFinal();
    }
    if (value.isPartialObject()) {
      clonedValue.makePartial();
    }
    if (value.isSimpleObject()) {
      clonedValue.makeSimple();
    }
  }
  if (rootObject !== undefined) {
    let setOfInlinedObjectProperties = realm.optionallyInlinedDerivedValues.get(rootObject);

    if (setOfInlinedObjectProperties === undefined) {
      setOfInlinedObjectProperties = new Set();
      realm.optionallyInlinedDerivedValues.set(rootObject, setOfInlinedObjectProperties);
    }
    setOfInlinedObjectProperties.add(clonedValue);
  }
}

function isPositiveInteger(str: string) {
  let n = Math.floor(Number(str));
  return n !== Infinity && String(n) === str && n >= 0;
}

function generateDeepIntrinsicName(intrinsicName: string, propName: string) {
  return `${intrinsicName}${isPositiveInteger(propName) ? `[${propName}]` : `.${propName}`}`;
}

function cloneAndModelObjectPropertyDescriptor(
  realm: Realm,
  object: ObjectValue,
  clonedObject: ObjectValue,
  propName: string,
  desc: PropertyDescriptor,
  intrinsicName: string,
  rootObject: void | ObjectValue,
  funcEffects: Effects
): PropertyDescriptor {
  let clonedDesc = cloneDescriptor(desc);
  invariant(clonedDesc !== undefined);
  let propertyIntrinsicName = generateDeepIntrinsicName(intrinsicName, propName);
  if (desc.value !== undefined) {
    let value = desc.value;
    if (value === object) {
      value = clonedObject;
    }
    let clonedValue = cloneAndModelValue(realm, value, propertyIntrinsicName, funcEffects, rootObject);
    clonedDesc.value = clonedValue;
    invariant(realm.createdObjects !== undefined);
    if (
      !(value instanceof PrimitiveValue) &&
      ((value instanceof ObjectValue && realm.createdObjects.has(value)) || value instanceof AbstractValue)
    ) {
      realm.optionallyInlinedDerivedPropertyDependencies.set(value, clonedObject);
    }
  } else {
    invariant(false, "// TODO handle get/set in cloneAndModelObjectPropertyDescriptor");
  }
  return clonedDesc;
}

function cloneAndModelValue(
  realm: Realm,
  val: Value,
  intrinsicName: string,
  funcEffects: Effects,
  rootObject: void | ObjectValue
): Value {
  if (val instanceof ConcreteValue) {
    if (val instanceof PrimitiveValue) {
      return val;
    } else if (val instanceof ObjectValue) {
      // If the value was created inside the funcEffects, then that means we need to clone it
      // otherwise we can just return the value
      if (!funcEffects.createdObjects.has(val)) {
        return val;
      }
      if (val instanceof ArrayValue) {
        let clonedObject = new ArrayValue(realm, intrinsicName);
        cloneObjectProperties(realm, clonedObject, val, intrinsicName, rootObject, funcEffects);
        applyPostValueConfig(realm, val, clonedObject, rootObject);
        return clonedObject;
      } else if (val instanceof FunctionValue) {
        if (val instanceof BoundFunctionValue) {
          let targetFunction = val.$BoundTargetFunction;
          let clonedTargetFunction = cloneAndModelValue(realm, targetFunction, intrinsicName, funcEffects, rootObject);
          invariant(clonedTargetFunction instanceof ECMAScriptSourceFunctionValue);
          let clonedBoundFunction = Functions.BoundFunctionCreate(
            realm,
            clonedTargetFunction,
            val.$BoundThis,
            val.$BoundArguments
          );
          applyPostValueConfig(realm, val, clonedBoundFunction, rootObject);
          return clonedBoundFunction;
        }
        // TODO We do not support functions properly yet
        invariant(false, "TODO support function values in cloneAndModelValue");
      } else {
        let clonedObject = new ObjectValue(realm, realm.intrinsics.ObjectPrototype, intrinsicName);
        cloneObjectProperties(realm, clonedObject, val, intrinsicName, rootObject, funcEffects);
        applyPostValueConfig(realm, val, clonedObject, rootObject);
        return clonedObject;
      }
    }
  } else if (val instanceof AbstractValue) {
    let status = getOptionalInlinableStatus(realm, val, funcEffects, false);
    if (status === "OPTIONALLY_INLINE_WITH_CLONING") {
      debugger;
      invariant(false, "TODO support cloning and modeling OPTIONALLY_INLINE_WITH_CLONING");
    } else if (status === "OPTIONALLY_INLINE") {
      let abstractalue = AbstractValue.createAbstractArgument(realm, intrinsicName, undefined, val.getType());
      abstractalue.intrinsicName = intrinsicName;
      applyPostValueConfig(realm, val, abstractalue, rootObject);
      return abstractalue;
    }
  }
  invariant(false, "cloneValue was passed an unknown type of cloneValue");
}

function createTemporalModeledValue(
  realm: Realm,
  val: Value,
  intrinsicName: void | string,
  temporalArgs: void | Array<Value>,
  rootObject: void | ObjectValue,
  funcEffects: Effects
): Value {
  invariant(temporalArgs !== undefined);
  invariant(realm.generator !== undefined);
  if (val instanceof ConcreteValue) {
    return realm.generator.deriveConcreteObjectFromBuildFunction(
      _intrinsicName => {
        let obj = cloneAndModelValue(realm, val, _intrinsicName, funcEffects, undefined);
        invariant(obj instanceof ObjectValue);
        obj.intrinsicName = _intrinsicName;
        return obj;
      },
      temporalArgs,
      createOperationDescriptor("CALL_BAILOUT", { propRef: undefined, thisArg: undefined }),
      // TODO: isPure isn't strictly correct here, as the function
      // might contain abstract function calls that we need to happen
      // and won't happen if the temporal is never referenced (thus DCE).
      { isPure: true }
    );
  } else if (val instanceof AbstractValue) {
    return realm.generator.deriveAbstractFromBuildFunction(
      _intrinsicName => {
        let obj = cloneAndModelValue(realm, val, _intrinsicName, funcEffects, undefined);
        invariant(obj instanceof AbstractValue);
        obj.intrinsicName = _intrinsicName;
        return obj;
      },
      temporalArgs,
      createOperationDescriptor("CALL_BAILOUT", { propRef: undefined, thisArg: undefined }),
      // TODO: isPure isn't strictly correct here, as the function
      // might contain abstract function calls that we need to happen
      // and won't happen if the temporal is never referenced (thus DCE).
      { isPure: true }
    );
  }
  invariant(false, "createTemporalModeledValue was passed a value with an unknown type");
}

function createDeepClonedTemporalValue(
  realm: Realm,
  val: Value,
  temporalArgs: Array<Value>,
  funcEffects: Effects
): [Value, Effects] {
  let clonedObject;
  let effects = realm.evaluateForEffects(
    () => {
      clonedObject = createTemporalModeledValue(realm, val, undefined, temporalArgs, undefined, funcEffects);
      return realm.intrinsics.undefined;
    },
    undefined,
    "createAbstractTemporalValue"
  );
  invariant(clonedObject instanceof Value);
  return [clonedObject, effects];
}

function createAbstractTemporalValue(realm: Realm, val: Value, temporalArgs: Array<Value>): [Value, Effects] {
  let abstractVal;
  let effects = realm.evaluateForEffects(
    () => {
      abstractVal = AbstractValue.createTemporalFromBuildFunction(
        realm,
        val.getType(),
        temporalArgs,
        createOperationDescriptor("CALL_BAILOUT", { propRef: undefined, thisArg: undefined }),
        // TODO: isPure isn't strictly correct here, as the function
        // might contain abstract function calls that we need to happen
        // and won't happen if the temporal is never referenced (thus DCE).
        { isPure: true }
      );
      return realm.intrinsics.undefined;
    },
    undefined,
    "createDeepClonedTemporalValue"
  );
  invariant(abstractVal instanceof AbstractValue);
  return [abstractVal, effects];
}

// If we have a value that is already instrincis and was created outside of the function we're not trying
// to inline then bail-out.
function isValueAnAlreadyDefinedObjectIntrinsic(realm: Realm, val: Value) {
  invariant(realm.createdObjects !== undefined);
  return val instanceof ObjectValue && val.isIntrinsic() && !realm.createdObjects.has(val);
}

export function OptionallyInlineInternalCall(
  realm: Realm,
  F: ECMAScriptFunctionValue,
  thisArgument: Value,
  argsList: Array<Value>
): Value {
  let effects = realm.evaluateForEffects(
    () => InternalCall(realm, F, thisArgument, argsList, 0),
    null,
    "possiblePureFuncCall $Call"
  );
  let result = effects.result;
  if (result instanceof AbruptCompletion) {
    realm.applyEffects(effects);
    throw result;
  } else if (result instanceof JoinedNormalAndAbruptCompletions) {
    // TODO we should support not inlining JoinedNormalAndAbruptCompletions at some point
    return InternalCall(realm, F, thisArgument, argsList, 0);
  } else if (result instanceof SimpleNormalCompletion) {
    result = result.value;
  }
  invariant(result instanceof Value);
  // We always inline primitive values that are returned. There's no apparant benefit from
  // trying to optimize them given they are constant.
  if (!(result instanceof PrimitiveValue) && effectsArePure(realm, effects, F)) {
    let generator = effects.generator;
    // For now, we do not apply this optimization if we pass arguments that contain functions
    // otherwise we will have to materialize the function bodies, thus potentially undoing the
    // wins of this optimization.
    if (
      generator._entries.length > 1 &&
      !argsContainFunctionValues(realm, argsList) &&
      !isValueAnAlreadyDefinedObjectIntrinsic(realm, result)
    ) {
      let optimizedValue;
      let optimizedEffects;

      realm.withEffectsAppliedInGlobalEnv(() => {
        invariant(result instanceof Value);
        let status = getOptionalInlinableStatus(realm, result, effects, false);
        if (status === "OPTIONALLY_INLINE") {
          [optimizedValue, optimizedEffects] = createAbstractTemporalValue(realm, result, [F, ...argsList]);
        } else if (status === "OPTIONALLY_INLINE_WITH_CLONING") {
          [optimizedValue, optimizedEffects] = createDeepClonedTemporalValue(realm, result, [F, ...argsList], effects);
        }
        return realm.intrinsics.undefined;
      }, effects);

      if (optimizedValue !== undefined && optimizedEffects !== undefined) {
        // TODO we need to leak on some of the bindings of F, leaking right now
        // causes failures because we remove much of the value we get from this optimization.
        realm.applyEffects(optimizedEffects);
        return optimizedValue;
      }
    }
  }
  realm.applyEffects(effects);
  return result;
}
