/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

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
  StringValue,
  Value,
} from "../values/index.js";
import invariant from "../invariant.js";
import { Functions, Materialize, Properties, Utils } from "../singletons.js";
import { PropertyDescriptor, cloneDescriptor } from "../descriptors.js";
import { createOperationDescriptor, Generator } from "../utils/generator.js";
import { Get } from "./index.js";
import { InternalCall } from "./function.js";
import { valueIsKnownReactAbstraction } from "../react/utils.js";

type OutliningStatus =
  | "NEEDS_INLINING"
  | "OUTLINE_WITH_NON_INTRINSIC_CLONING"
  | "OUTLINE_WITH_INTRINSIC_CLONING"
  | "OUTLINE"
  | "OUTLINE_DUE_TO_COMPLEXITY";

type LossyConfigProperty =
  | "OBJECT_ABSTRACT_PROPERTIES"
  | "OBJECT_FUNCTION_PROPERTIES"
  | "COMPLEX_ABSTRACT_CONDITIONS"
  | "ARRAY_ABSTRACT_PROPERTIES"
  | "ARRAY_FUNCTION_PROPERTIES";

function checkLossyConfigPropertyEnabled(realm: Realm, property: LossyConfigProperty): boolean {
  if (realm.functionCallOutliningEnabled && realm.functionCallOutliningLossyConfig !== undefined) {
    return realm.functionCallOutliningLossyConfig[property] === true;
  }
  return false;
}

function canAvoidPropertyInliningWithLossyConfig(realm: Realm, obj: ObjectValue, propVal: Value): boolean {
  invariant(realm.functionCallOutliningEnabled);
  // If the property matches against the below heuristics and we've got the lossy setting on to ignore them
  // if they come back as NEEDS_INLINING, then we ultimately making the property value abstract
  // during the cloning/remodeling phase.
  if (
    propVal instanceof AbstractValue &&
    obj instanceof ArrayValue &&
    obj.$Prototype === realm.intrinsics.ArrayPrototype &&
    checkLossyConfigPropertyEnabled(realm, "ARRAY_ABSTRACT_PROPERTIES")
  ) {
    return true;
  } else if (
    propVal instanceof FunctionValue &&
    obj instanceof ArrayValue &&
    obj.$Prototype === realm.intrinsics.ArrayPrototype &&
    checkLossyConfigPropertyEnabled(realm, "ARRAY_FUNCTION_PROPERTIES")
  ) {
    return true;
  } else if (
    propVal instanceof AbstractValue &&
    obj.$Prototype === realm.intrinsics.ObjectPrototype &&
    checkLossyConfigPropertyEnabled(realm, "OBJECT_ABSTRACT_PROPERTIES")
  ) {
    return true;
  } else if (
    propVal instanceof FunctionValue &&
    obj.$Prototype === realm.intrinsics.ObjectPrototype &&
    checkLossyConfigPropertyEnabled(realm, "OBJECT_FUNCTION_PROPERTIES")
  ) {
    return true;
  }
  return false;
}

function getRootOutliningStatus(realm: Realm, val: Value, funcEffects: Effects): OutliningStatus {
  let status = getOutliningStatus(realm, val, funcEffects, false, 0);
  if (status === "OUTLINE_WITH_INTRINSIC_CLONING" && val instanceof AbstractValue) {
    // If the root value is an abstract value adn we have OUTLINE_WITH_INTRINSIC_CLONING,
    // then we can't propery clone the value because the intrinsic names of the objects
    // in the value will not correctly match up.
    return "NEEDS_INLINING";
  }
  return status;
}

function getOutliningStatusFromConcreteValue(
  realm: Realm,
  val: ConcreteValue,
  funcEffects: Effects,
  checkAbstractsAreTemporals: boolean,
  abstractDepth: number
): OutliningStatus {
  if (val instanceof PrimitiveValue) {
    return "OUTLINE_WITH_NON_INTRINSIC_CLONING";
  } else if (val instanceof ObjectValue) {
    // If the object was created outside of the function we're trying not to inline, then it's
    // always safe to optimize with this object. Although we return OUTLINE_WITH_INTRINSIC_CLONING,
    // the logic inside the cloneOrModelValue will always return the same value if it's been created
    // outside of the function we're trying not to inline.
    if (funcEffects !== undefined && !funcEffects.createdObjects.has(val)) {
      return "OUTLINE_WITH_NON_INTRINSIC_CLONING";
    }
    // TODO eventually support temporalAlias, if it's possible
    if (val.temporalAlias !== undefined) {
      return "NEEDS_INLINING";
    }
    if (val.isIntrinsic()) {
      // TODO: are there issues around objects that are intrinsic? I'm not 100% sure.
    }
    if (val.mightBeLeakedObject()) {
      // TODO: are there issues around objects that have leaked? I'm not 100% sure.
    }
    // Check the status of the properties to see if any of them need inlining
    for (let [propName, binding] of val.properties) {
      if (binding && binding.descriptor) {
        // TODO support prototypes and callee
        if (propName === "callee" || propName === "prototype") {
          // Given we don't support cloning functions now, we only check this for other objects
          if (val instanceof FunctionValue) {
            continue;
          }
          invariant(false, "TODO support prototype and callee for non-function objects");
        }
        invariant(val instanceof ObjectValue);
        let propVal = Get(realm, val, propName);
        let propStatus = getOutliningStatus(realm, propVal, funcEffects, checkAbstractsAreTemporals, abstractDepth);

        if (propStatus === "NEEDS_INLINING" && !canAvoidPropertyInliningWithLossyConfig(realm, val, propVal)) {
          return "NEEDS_INLINING";
        }
      }
    }
    if (val instanceof ArrayValue) {
      if (ArrayValue.isIntrinsicAndHasWidenedNumericProperty(val)) {
        // Needs inlining as it will likely reference a nested optimized function
        // and given this array was created inside the function, there's no
        // real easy way to clone the array and the nested optimized function.
        return "NEEDS_INLINING";
      }
      if (val.$Prototype === realm.intrinsics.ArrayPrototype) {
        return "OUTLINE_WITH_INTRINSIC_CLONING";
      }
      return "NEEDS_INLINING";
    } else if (val instanceof FunctionValue) {
      if (val.$Prototype === realm.intrinsics.FunctionPrototype) {
        if (val instanceof ECMAScriptSourceFunctionValue) {
          // TODO support some form of function outlining. It might be too expensive/complex to do other than
          // checking if simple functions have unbound reads to bindings already created in the environment.
          return "NEEDS_INLINING";
        } else if (val instanceof BoundFunctionValue) {
          let thisStatus = getOutliningStatus(
            realm,
            val.$BoundThis,
            funcEffects,
            checkAbstractsAreTemporals,
            abstractDepth
          );

          if (thisStatus === "NEEDS_INLINING") {
            return "NEEDS_INLINING";
          }
          for (let boundArg of val.$BoundArguments) {
            let boundArgStatus = getOutliningStatus(
              realm,
              boundArg,
              funcEffects,
              checkAbstractsAreTemporals,
              abstractDepth
            );

            if (boundArgStatus === "NEEDS_INLINING") {
              return "NEEDS_INLINING";
            }
          }
          let targetFunctionStatus = getOutliningStatus(
            realm,
            val.$BoundTargetFunction,
            funcEffects,
            checkAbstractsAreTemporals,
            abstractDepth
          );

          if (targetFunctionStatus === "NEEDS_INLINING") {
            return "NEEDS_INLINING";
          }
          return "OUTLINE_WITH_INTRINSIC_CLONING";
        }
      }
      return "NEEDS_INLINING";
    } else {
      if (val.$Prototype === realm.intrinsics.ObjectPrototype) {
        return "OUTLINE_WITH_INTRINSIC_CLONING";
      }
      return "NEEDS_INLINING";
    }
  }
  invariant(false, "unknown concrete value type");
}

function getOutliningStatusFromAbstractValue(
  realm: Realm,
  val: AbstractValue,
  funcEffects: Effects,
  checkAbstractsAreTemporals: boolean,
  abstractDepth: number
): OutliningStatus {
  if (!funcEffects.createdAbstracts.has(val)) {
    return "OUTLINE_WITH_NON_INTRINSIC_CLONING";
  }
  if (valueIsKnownReactAbstraction(realm, val)) {
    // TODO check if all abstractions are always temporal, if they are not
    // we can probably clone/optimize the ones that are not
    return "NEEDS_INLINING";
  }
  if (val.kind === "conditional") {
    let [condValue, consequentVal, alternateVal] = val.args;
    invariant(condValue instanceof AbstractValue);
    let consequentStatus = getOutliningStatus(
      realm,
      consequentVal,
      funcEffects,
      checkAbstractsAreTemporals,
      abstractDepth + 1 // For conditonals always increase depth
    );
    let alternateStatus = getOutliningStatus(
      realm,
      alternateVal,
      funcEffects,
      checkAbstractsAreTemporals,
      abstractDepth + 1 // For conditonals always increase depth
    );

    if (consequentStatus === "OUTLINE_DUE_TO_COMPLEXITY" || alternateStatus === "OUTLINE_DUE_TO_COMPLEXITY") {
      return "OUTLINE_DUE_TO_COMPLEXITY";
    }
    if (consequentStatus === "OUTLINE" && alternateStatus === "OUTLINE") {
      return "OUTLINE";
    }
    // We can't clone objects from within a conditional due to how the intrinsic name system works.
    // Otherwise if we the consequentVal and alternateVal would both have the same intrinsic names.
    // Furthermore, if we have a status back that is OUTLINE then we must also bail-out and inline
    // the value. We can only OUTLINE the entire abstract if both consequentStatus and alternateStatus
    // are OUTLINE (which we check above).
    if (
      consequentStatus === "OUTLINE_WITH_INTRINSIC_CLONING" ||
      alternateStatus === "OUTLINE_WITH_INTRINSIC_CLONING" ||
      consequentStatus === "NEEDS_INLINING" ||
      alternateStatus === "NEEDS_INLINING" ||
      consequentStatus === "OUTLINE" ||
      alternateStatus === "OUTLINE"
    ) {
      // If we have lossy settings enabled, see if the heuristics match
      if (checkLossyConfigPropertyEnabled(realm, "COMPLEX_ABSTRACT_CONDITIONS") && abstractDepth > 5) {
        return "OUTLINE_DUE_TO_COMPLEXITY";
      }
      return "NEEDS_INLINING";
    }
    if (!checkAbstractsAreTemporals) {
      // The above consequentStatus and alternateStatus status did not take into consideration
      // if any abstract values were temporals. It did this so we could find any cases where both
      // sides of the conditional are both "OUTLINE" status. In this case, we can fast-path and
      // always return "OUTLINE". The problem is that, for correctness, given we've not returned
      // early, we now need to re-check this conditional, taking temporals into consideration.
      let status = getOutliningStatus(realm, val, funcEffects, true, abstractDepth);
      if (status === "OUTLINE_DUE_TO_COMPLEXITY") {
        return "OUTLINE_DUE_TO_COMPLEXITY";
      } else if (status === "NEEDS_INLINING") {
        return "NEEDS_INLINING";
      }
    } else {
      // If we get here, we need to do one last check, this time on the condValue.
      // If the condValue also comes back with OUTLINE_WITH_NON_INTRINSIC_CLONING, then we can safely
      // make the entire conditional value OUTLINE_WITH_NON_INTRINSIC_CLONING.
      let condStatus = getOutliningStatus(realm, condValue, funcEffects, true, abstractDepth);
      if (condStatus === "OUTLINE_DUE_TO_COMPLEXITY") {
        return "OUTLINE_DUE_TO_COMPLEXITY";
      } else if (condStatus === "NEEDS_INLINING") {
        return "NEEDS_INLINING";
      }
    }
    return "OUTLINE_WITH_NON_INTRINSIC_CLONING";
  } else if (val.args.length > 0) {
    let outliningStatus;
    let shouldIncreaseDepth = val.kind === "||" || "&&";

    for (let arg of val.args) {
      // We care if the arg is temporal here, as it means we can't clone the abstract
      let status = getOutliningStatus(
        realm,
        arg,
        funcEffects,
        checkAbstractsAreTemporals,
        shouldIncreaseDepth ? abstractDepth + 1 : abstractDepth
      );
      if (status === "OUTLINE_DUE_TO_COMPLEXITY") {
        return "OUTLINE_DUE_TO_COMPLEXITY";
      }
      // We can't clone objects from within an asbtract due to how the intrinsic name system works.
      // Otherwise if we if all the args were objects that need cloning, then they'd all have the same
      // intrinsic name due to how this optimization implementation works. Furthermore, if we have a
      // status back that is OUTLINE and it differs from the last status, then we must also bail-out and
      // inline the value. We can only OUTLINE the entire abstract if all args are OUTLINE.
      if (
        status === "NEEDS_INLINING" ||
        status === "OUTLINE_WITH_INTRINSIC_CLONING" ||
        (status === "OUTLINE" && outliningStatus !== "OUTLINE" && outliningStatus !== undefined)
      ) {
        // If we have lossy settings enabled, see if the heuristics match
        if (checkLossyConfigPropertyEnabled(realm, "COMPLEX_ABSTRACT_CONDITIONS") && abstractDepth > 5) {
          return "OUTLINE_DUE_TO_COMPLEXITY";
        }
        return "NEEDS_INLINING";
      }
      if (status === "OUTLINE_WITH_NON_INTRINSIC_CLONING") {
        outliningStatus = "OUTLINE_WITH_NON_INTRINSIC_CLONING";
      } else if (outliningStatus === undefined) {
        outliningStatus = status;
      }
    }
    if (!checkAbstractsAreTemporals && outliningStatus === "OUTLINE_WITH_NON_INTRINSIC_CLONING") {
      // The above outliningStatus status did not take into consideration if any abstracts
      // were temporals. It did this so we could find any cases where all args of the abstract
      // are "OUTLINE" status. In this case, we can fast-path and always return "OUTLINE".
      // The problem is that, for correctness, given we've not returned early, we now need
      // to re-check this abstract's args, taking all temporals into consideration.
      let status = getOutliningStatus(realm, val, funcEffects, true, abstractDepth);
      if (status === "OUTLINE_DUE_TO_COMPLEXITY") {
        return "OUTLINE_DUE_TO_COMPLEXITY";
      } else if (status === "NEEDS_INLINING") {
        return "NEEDS_INLINING";
      }
    }
    invariant(outliningStatus !== undefined);
    return outliningStatus;
  }
  if (checkAbstractsAreTemporals && val.isTemporal()) {
    return "NEEDS_INLINING";
  }
  if (val instanceof AbstractObjectValue) {
    if (val.values.isTop() || val.values.isBottom()) {
      return "OUTLINE";
    }
    // TODO check values in values and handle those cases
    return "NEEDS_INLINING";
  }
  // By the time we get here it should be safe to outline the abstract value.
  return "OUTLINE";
}

function getOutliningStatus(
  realm: Realm,
  val: Value,
  funcEffects: Effects,
  checkAbstractsAreTemporals: boolean,
  abstractDepth: number
): OutliningStatus {
  if (val instanceof ConcreteValue) {
    return getOutliningStatusFromConcreteValue(realm, val, funcEffects, checkAbstractsAreTemporals, abstractDepth);
  } else if (val instanceof AbstractValue) {
    return getOutliningStatusFromAbstractValue(realm, val, funcEffects, checkAbstractsAreTemporals, abstractDepth);
  }
  invariant(false, "unknown value type found in getOutliningStatus");
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
      invariant(false, "TODO support prototype and callee");
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
    clonedValue.isScopedTemplate = true;
  }
  if (value instanceof ObjectValue && clonedValue instanceof ObjectValue) {
    if (realm.react.reactProps.has(value)) {
      realm.react.reactProps.add(clonedValue);
    }
    if (value.isPartialObject()) {
      clonedValue.makePartial();
    }
    if (value.isSimpleObject()) {
      clonedValue.makeSimple();
    }
    if (value.mightBeFinalObject()) {
      clonedValue.makeFinal();
    }
  }
  if (rootObject !== undefined) {
    let setOfOutlineddObjectProperties = realm.functionCallOutliningDerivedValues.get(rootObject);

    if (setOfOutlineddObjectProperties === undefined) {
      setOfOutlineddObjectProperties = new Set();
      realm.functionCallOutliningDerivedValues.set(rootObject, setOfOutlineddObjectProperties);
    }
    setOfOutlineddObjectProperties.add(clonedValue);
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
      value !== clonedValue &&
      !(value instanceof PrimitiveValue) &&
      ((value instanceof ObjectValue && realm.createdObjects.has(value)) || value instanceof AbstractValue)
    ) {
      realm.functionCallOutliningDerivedPropertyDependencies.set(clonedValue, clonedObject);
    }
  } else {
    invariant(false, "// TODO handle get/set in cloneAndModelObjectPropertyDescriptor");
  }
  return clonedDesc;
}

function cloneAndModelObjectValue(
  realm: Realm,
  val: ObjectValue,
  intrinsicName: null | string,
  funcEffects: Effects,
  rootObject: void | ObjectValue
): Value {
  // If the value was created inside the funcEffects, then that means we need to clone it
  // otherwise we can just return the value
  if (!funcEffects.createdObjects.has(val)) {
    return val;
  }
  invariant(intrinsicName !== null);
  if (val instanceof ArrayValue) {
    invariant(val.$Prototype === realm.intrinsics.ArrayPrototype);
    let clonedObject = new ArrayValue(realm, intrinsicName);
    cloneObjectProperties(realm, clonedObject, val, intrinsicName, rootObject, funcEffects);
    applyPostValueConfig(realm, val, clonedObject, rootObject);
    return clonedObject;
  } else if (val instanceof FunctionValue) {
    invariant(val.$Prototype === realm.intrinsics.FunctionPrototype);
    if (val instanceof BoundFunctionValue) {
      let targetFunction = val.$BoundTargetFunction;
      let clonedTargetFunction = cloneAndModelValue(realm, targetFunction, intrinsicName, funcEffects, rootObject);
      if (clonedTargetFunction instanceof AbstractValue) {
        return clonedTargetFunction;
      }
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
    let abstractalue = AbstractValue.createAbstractArgument(realm, intrinsicName, undefined, val.getType());
    abstractalue.intrinsicName = intrinsicName;
    applyPostValueConfig(realm, val, abstractalue, rootObject);
    return abstractalue;
  } else {
    invariant(val.$Prototype === realm.intrinsics.ObjectPrototype);
    invariant(!val.isTemporal());
    let clonedObject = new ObjectValue(realm, realm.intrinsics.ObjectPrototype, intrinsicName);
    cloneObjectProperties(realm, clonedObject, val, intrinsicName, rootObject, funcEffects);
    applyPostValueConfig(realm, val, clonedObject, rootObject);
    return clonedObject;
  }
}

function cloneAndModelAbstractValue(
  realm: Realm,
  val: AbstractValue,
  funcEffects: Effects,
  rootObject: void | ObjectValue
): Value {
  if (valueIsKnownReactAbstraction(realm, val)) {
    invariant(false, "we should never hit a React known abstract, they should always be inlined as they are temporal");
  }
  const kind = val.kind;
  if (kind === "conditional") {
    // Conditional ops
    let [condValue, consequentVal, alternateVal] = val.args;
    let clonedCondValue = cloneAndModelValue(realm, condValue, null, funcEffects, rootObject);
    let clonedConsequentVal = cloneAndModelValue(realm, consequentVal, null, funcEffects, rootObject);
    let clonedAlternateVal = cloneAndModelValue(realm, alternateVal, null, funcEffects, rootObject);
    return AbstractValue.createFromConditionalOp(realm, clonedCondValue, clonedConsequentVal, clonedAlternateVal);
  } else if (
    kind === "+" ||
    kind === "-" ||
    kind === "!=" ||
    kind === "==" ||
    kind === "===" ||
    kind === "!==" ||
    kind === "instanceof" ||
    kind === "in" ||
    kind === ">" ||
    kind === "<" ||
    kind === ">=" ||
    kind === "<=" ||
    kind === ">>>" ||
    kind === ">>" ||
    kind === "<<" ||
    kind === "&" ||
    kind === "|" ||
    kind === "^" ||
    kind === "**" ||
    kind === "%" ||
    kind === "/" ||
    kind === "*"
  ) {
    // Binary ops
    let [leftValue, rightValue] = val.args;
    let clonedLeftValue = cloneAndModelValue(realm, leftValue, null, funcEffects, rootObject);
    let clonedRightValue = cloneAndModelValue(realm, rightValue, null, funcEffects, rootObject);
    return AbstractValue.createFromBinaryOp(realm, kind, clonedLeftValue, clonedRightValue);
  } else if (kind === "&&" || kind === "||") {
    // Logical ops
    let [leftValue, rightValue] = val.args;
    let clonedLeftValue = cloneAndModelValue(realm, leftValue, null, funcEffects, rootObject);
    let clonedRightValue = cloneAndModelValue(realm, rightValue, null, funcEffects, rootObject);
    return AbstractValue.createFromLogicalOp(realm, kind, clonedLeftValue, clonedRightValue);
  } else if (
    kind === "!" ||
    kind === "typeof" ||
    kind === "delete" ||
    kind === "+" ||
    kind === "-" ||
    kind === "void" ||
    kind === "~"
  ) {
    // Unary ops
    let [condValue] = val.args;
    let clonedCondValue = cloneAndModelValue(realm, condValue, null, funcEffects, rootObject);
    invariant(val.operationDescriptor !== undefined);
    invariant(clonedCondValue instanceof AbstractValue);
    let hasPrefix = val.operationDescriptor.data.prefix;
    return AbstractValue.createFromUnaryOp(realm, kind, clonedCondValue, hasPrefix);
  } else if (kind === "abstractConcreteUnion") {
    let [abstractPropertyValue, ...concreteValues] = val.args;
    let clonedAbstractPropertyValue = cloneAndModelValue(realm, abstractPropertyValue, null, funcEffects, rootObject);
    let clonedConcreteValues = concreteValues.map(concreteValue => {
      let clonedConcreteValue = cloneAndModelValue(realm, concreteValue, null, funcEffects, rootObject);
      invariant(clonedConcreteValue instanceof ConcreteValue);
      return clonedConcreteValue;
    });
    invariant(clonedAbstractPropertyValue instanceof AbstractValue);
    return AbstractValue.createAbstractConcreteUnion(realm, clonedAbstractPropertyValue, clonedConcreteValues);
  } else if (kind !== undefined && kind.startsWith("property:")) {
    let clonedArgs = val.args.map(arg => cloneAndModelValue(realm, arg, null, funcEffects, rootObject));
    let P = clonedArgs[1];
    invariant(P instanceof StringValue);
    return AbstractValue.createFromBuildFunction(
      realm,
      val.getType(),
      clonedArgs,
      createOperationDescriptor("ABSTRACT_PROPERTY"),
      { kind: AbstractValue.makeKind("property", P.value) }
    );
  }
  invariant(false, "TODO unsupported abstract value type");
}

function cloneAndModelValue(
  realm: Realm,
  val: Value,
  intrinsicName: null | string,
  funcEffects: Effects,
  rootObject: void | ObjectValue
): Value {
  if (val instanceof ConcreteValue) {
    if (val instanceof PrimitiveValue) {
      return val;
    } else if (val instanceof ObjectValue) {
      return cloneAndModelObjectValue(realm, val, intrinsicName, funcEffects, rootObject);
    }
  } else if (val instanceof AbstractValue) {
    // If the value was created inside the funcEffects, then that means we need to clone it
    // otherwise we can just return the value
    if (!funcEffects.createdAbstracts.has(val)) {
      return val;
    }
    let status = getOutliningStatus(realm, val, funcEffects, true, 0);
    if (status === "OUTLINE_WITH_INTRINSIC_CLONING" || status === "OUTLINE_WITH_NON_INTRINSIC_CLONING") {
      return cloneAndModelAbstractValue(realm, val, funcEffects, rootObject);
    } else {
      invariant(intrinsicName !== null);
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
  // We don't support cloning abstract values at the root for the derived entry.
  invariant(val instanceof ConcreteValue);
  return realm.generator.deriveConcreteObjectFromBuildFunction(
    _intrinsicName => {
      let obj = cloneAndModelValue(realm, val, _intrinsicName, funcEffects, undefined);
      invariant(obj instanceof ObjectValue);
      obj.intrinsicName = _intrinsicName;
      return obj;
    },
    temporalArgs,
    createOperationDescriptor("CALL_OPTIONAL_INLINE"),
    // TODO: isPure isn't strictly correct here, as the function
    // might contain abstract function calls that we need to happen
    // and won't happen if the temporal is never referenced (thus DCE).
    { isPure: true }
  );
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
        createOperationDescriptor("CALL_OPTIONAL_INLINE"),
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

// If we have a value that is already instrincis and was created outside of the function we're trying
// to outline then bail-out.
function isValueAnAlreadyDefinedObjectIntrinsic(realm: Realm, val: Value) {
  return (
    val instanceof ObjectValue &&
    val.isIntrinsic() &&
    (realm.createdObjects === undefined || !realm.createdObjects.has(val))
  );
}

function generatorSizeShouldBeOutlined(generator: Generator): boolean {
  // A heuristic of having a generator at least 3 entries or higher before it can be inlined
  // was a generally good number through testing on product code. Too small and the outlining
  // becomes redundant due to code size.
  return generator._entries.length > 2;
}

export function PossiblyOutlineInternalCall(
  realm: Realm,
  F: ECMAScriptFunctionValue,
  thisArgument: Value,
  argsList: Array<Value>
): Value {
  let savedOptimizedFunctions = new Set(realm.optimizedFunctions);
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
    // TODO we should support outlining JoinedNormalAndAbruptCompletions at some point
    return InternalCall(realm, F, thisArgument, argsList, 0);
  } else if (result instanceof SimpleNormalCompletion) {
    result = result.value;
  }
  invariant(result instanceof Value);
  let usesThis = thisArgument !== realm.intrinsics.undefined;
  let functionContainedOptimizeCalls = realm.optimizedFunctions.size !== savedOptimizedFunctions.size;
  // We always inline primitive values that are returned. There's no apparant benefit from
  // trying to optimize them given they are constant.
  // Furthermore, we do not support "usesThis". Outling functions that use "this" requires
  // us to materialize the "this" object and thus this creates vastly more code bloat than
  // without this optimization in place (around 50% more in real product code testing).
  if (
    !functionContainedOptimizeCalls &&
    !usesThis &&
    !(result instanceof PrimitiveValue) &&
    Utils.areEffectsPure(realm, effects, F)
  ) {
    if (generatorSizeShouldBeOutlined(effects.generator) && !isValueAnAlreadyDefinedObjectIntrinsic(realm, result)) {
      let optimizedValue;
      let optimizedEffects;

      realm.withEffectsAppliedInGlobalEnv(() => {
        invariant(result instanceof Value);
        let status = getRootOutliningStatus(realm, result, effects);
        if (status === "OUTLINE" || status === "OUTLINE_DUE_TO_COMPLEXITY") {
          [optimizedValue, optimizedEffects] = createAbstractTemporalValue(realm, result, [F, ...argsList]);
        } else if (status === "OUTLINE_WITH_INTRINSIC_CLONING") {
          [optimizedValue, optimizedEffects] = createDeepClonedTemporalValue(realm, result, [F, ...argsList], effects);
        }
        return realm.intrinsics.undefined;
      }, effects);

      if (optimizedValue !== undefined && optimizedEffects !== undefined) {
        // We need to materialize any objects we pass as arguments as objects
        for (let arg of argsList) {
          if (arg instanceof ObjectValue) {
            Materialize.materializeObject(realm, arg);
          }
        }
        // TODO we need to leak on some of the bindings of F, leaking right now
        // causes failures because we remove much of the value we get from this optimization.
        Materialize.materializeObject(realm, F);
        realm.applyEffects(optimizedEffects);
        return optimizedValue;
      }
    }
  }
  realm.applyEffects(effects);
  return result;
}
