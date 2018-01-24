/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import { Realm, type Effects } from "../realm.js";
import { ModuleTracer } from "../utils/modules.js";
import {
  ECMAScriptSourceFunctionValue,
  Value,
  UndefinedValue,
  StringValue,
  NumberValue,
  BooleanValue,
  NullValue,
  AbstractValue,
  ArrayValue,
  ObjectValue,
  AbstractObjectValue,
} from "../values/index.js";
import { ReactStatistics, type ReactSerializerState } from "../serializer/types.js";
import {
  isReactElement,
  valueIsClassComponent,
  forEachArrayValue,
  valueIsLegacyCreateClassComponent,
  getThisAssignments,
} from "./utils";
import { Get } from "../methods/index.js";
import invariant from "../invariant.js";
import { CompilerDiagnostic, FatalError } from "../errors.js";
import { BranchState, type BranchStatusEnum } from "./branching.js";
import {
  getInitialProps,
  getInitialContext,
  createClassInstance,
  createSimpleClassInstance,
  type ClassComponentMetadata,
} from "./components.js";
import { ExpectedBailOut, SimpleClassBailOut } from "./errors.js";

type RenderStrategy = "NORMAL" | "RELAY_QUERY_RENDERER";

export class Reconciler {
  constructor(
    realm: Realm,
    moduleTracer: ModuleTracer,
    statistics: ReactStatistics,
    reactSerializerState: ReactSerializerState,
    simpleClassComponents: Set<Value>
  ) {
    this.realm = realm;
    this.moduleTracer = moduleTracer;
    this.statistics = statistics;
    this.reactSerializerState = reactSerializerState;
    this.simpleClassComponents = simpleClassComponents;
  }

  realm: Realm;
  moduleTracer: ModuleTracer;
  statistics: ReactStatistics;
  reactSerializerState: ReactSerializerState;
  simpleClassComponents: Set<Value>;

  render(componentType: ECMAScriptSourceFunctionValue): Effects {
    return this.realm.wrapInGlobalEnv(() =>
      this.realm.evaluatePure(() =>
        // TODO: (sebmarkbage): You could use the return value of this to detect if there are any mutations on objects other
        // than newly created ones. Then log those to the error logger. That'll help us track violations in
        // components. :)
        this.realm.evaluateForEffects(
          () => {
            // initialProps and initialContext are created from Flow types from:
            // - if a functional component, the 1st and 2nd paramater of function
            // - if a class component, use this.props and this.context
            // if there are no Flow types for props or context, we will throw a
            // FatalError, unless it's a functional component that has no paramater
            // i.e let MyComponent = () => <div>Hello world</div>
            try {
              let initialProps = getInitialProps(this.realm, componentType);
              let initialContext = getInitialContext(this.realm, componentType);
              let { result } = this._renderComponent(componentType, initialProps, initialContext, "ROOT", null);
              this.statistics.optimizedTrees++;
              return result;
            } catch (error) {
              // if there was a bail-out on the root component in this reconcilation process, then this
              // should be an invariant as the user has explicitly asked for this component to get folded
              if (error instanceof ExpectedBailOut) {
                let diagnostic = new CompilerDiagnostic(
                  `__registerReactComponentRoot() failed due to - ${error.message}`,
                  this.realm.currentLocation,
                  "PP0020",
                  "FatalError"
                );
                this.realm.handleError(diagnostic);
                throw new FatalError();
              }
              throw error;
            }
          },
          /*state*/ null,
          `react component: ${componentType.getName()}`
        )
      )
    );
  }

  _renderComplexClassComponent(
    componentType: ECMAScriptSourceFunctionValue,
    props: ObjectValue | AbstractObjectValue,
    context: ObjectValue | AbstractObjectValue,
    classMetadata: ClassComponentMetadata,
    branchStatus: BranchStatusEnum,
    branchState: BranchState | null
  ): Value {
    if (branchStatus !== "ROOT") {
      throw new ExpectedBailOut(
        "only complex class components at the root of __registerReactComponentRoot() are supported"
      );
    }
    // create a new instance of this React class component
    let instance = createClassInstance(this.realm, componentType, props, context, classMetadata);
    // get the "render" method off the instance
    let renderMethod = Get(this.realm, instance, "render");
    invariant(
      renderMethod instanceof ECMAScriptSourceFunctionValue && renderMethod.$Call,
      "Expected render method to be a FunctionValue with $Call method"
    );
    // the render method doesn't have any arguments, so we just assign the context of "this" to be the instance
    return renderMethod.$Call(instance, []);
  }

  _renderSimpleClassComponent(
    componentType: ECMAScriptSourceFunctionValue,
    props: ObjectValue | AbstractObjectValue,
    context: ObjectValue | AbstractObjectValue,
    branchStatus: BranchStatusEnum,
    branchState: BranchState | null
  ): Value {
    // create a new simple instance of this React class component
    let instance = createSimpleClassInstance(this.realm, componentType, props, context);
    // get the "render" method off the instance
    let renderMethod = Get(this.realm, instance, "render");
    invariant(
      renderMethod instanceof ECMAScriptSourceFunctionValue && renderMethod.$Call,
      "Expected render method to be a FunctionValue with $Call method"
    );
    // the render method doesn't have any arguments, so we just assign the context of "this" to be the instance
    return renderMethod.$Call(instance, []);
  }

  _renderFunctionalComponent(
    componentType: ECMAScriptSourceFunctionValue,
    props: ObjectValue | AbstractObjectValue,
    context: ObjectValue | AbstractObjectValue
  ) {
    invariant(componentType.$Call, "Expected componentType to be a FunctionValue with $Call method");
    return componentType.$Call(this.realm.intrinsics.undefined, [props, context]);
  }

  _getClassComponentMetadata(componentType: ECMAScriptSourceFunctionValue): ClassComponentMetadata {
    if (this.realm.react.classComponentMetadata.has(componentType)) {
      let classMetadata = this.realm.react.classComponentMetadata.get(componentType);
      invariant(classMetadata);
      return classMetadata;
    }
    // get all this assignments in the constructor
    let componentPrototype = Get(this.realm, componentType, "prototype");
    invariant(componentPrototype instanceof ObjectValue);
    let constructorMethod = Get(this.realm, componentPrototype, "constructor");
    invariant(constructorMethod instanceof ECMAScriptSourceFunctionValue);
    let thisAssignments = getThisAssignments(constructorMethod.$ECMAScriptCode);
    let classMetadata = {
      thisAssignments,
    };
    this.realm.react.classComponentMetadata.set(componentType, classMetadata);
    return classMetadata;
  }

  _renderRelayQueryRendererComponent(
    reactElement: ObjectValue,
    props: ObjectValue | AbstractObjectValue,
    context: ObjectValue | AbstractObjectValue
  ) {
    // TODO: for now we do nothing, in the future we want to evaluate the render prop of this component
    return {
      result: reactElement,
      childContext: context,
    };
  }

  _renderComponent(
    componentType: Value,
    props: ObjectValue | AbstractObjectValue,
    context: ObjectValue | AbstractObjectValue,
    branchStatus: BranchStatusEnum,
    branchState: BranchState | null
  ) {
    invariant(componentType instanceof ECMAScriptSourceFunctionValue);
    let value;
    let childContext = context;

    // first we check if it's a legacy class component
    if (valueIsLegacyCreateClassComponent(this.realm, componentType)) {
      throw new ExpectedBailOut("components created with create-react-class are not supported");
    } else if (valueIsClassComponent(this.realm, componentType)) {
      let classMetadata = this._getClassComponentMetadata(componentType);
      let thisAssignments = classMetadata.thisAssignments;

      // if there were no this assignments we can try and render it as a simple class component
      if (thisAssignments.size === 0) {
        // We first need to know what type of class component we're dealing with.
        // A "simple" class component is defined as:
        //
        // - having only a "render" method or many method, i.e. render(), _renderHeader(), _renderFooter()
        // - having no lifecycle events
        // - having no state
        // - having no instance variables
        //
        // the only things a class component should be able to access on "this" are:
        // - this.props
        // - this.context
        // - this._someRenderMethodX() etc
        //
        // Otherwise, the class component is a "complex" one.
        // To begin with, we don't know what type of component it is, so we try and render it as if it were
        // a simple component using the above heuristics. If an error occurs during this process, we assume
        // that the class wasn't simple, then try again with the "complex" heuristics.
        try {
          value = this._renderSimpleClassComponent(componentType, props, context, branchStatus, branchState);
          this.simpleClassComponents.add(value);
        } catch (error) {
          // if we get back a SimpleClassBailOut error, we know that this class component
          // wasn't a simple one and is likely to be a complex class component instead
          if (error instanceof SimpleClassBailOut) {
            // the component was not simple, so we continue with complex case
          } else {
            // else we rethrow the error
            throw error;
          }
        }
      }
      // handle the complex class component if there is not value
      if (value === undefined) {
        value = this._renderComplexClassComponent(
          componentType,
          props,
          context,
          classMetadata,
          branchStatus,
          branchState
        );
      }
    } else {
      value = this._renderFunctionalComponent(componentType, props, context);
    }
    invariant(value !== undefined);
    return {
      result: this._resolveDeeply(value, context, branchStatus === "ROOT" ? "NO_BRANCH" : branchStatus, branchState),
      childContext,
    };
  }

  _getRenderStrategy(func: Value): RenderStrategy {
    // check if it's a ReactRelay.QueryRenderer
    if (this.realm.fbLibraries.reactRelay !== undefined) {
      let QueryRenderer = Get(this.realm, this.realm.fbLibraries.reactRelay, "QueryRenderer");
      if (func === QueryRenderer) {
        return "RELAY_QUERY_RENDERER";
      }
    }
    return "NORMAL";
  }

  _resolveDeeply(
    value: Value,
    context: ObjectValue | AbstractObjectValue,
    branchStatus: BranchStatusEnum,
    branchState: BranchState | null
  ) {
    if (
      value instanceof StringValue ||
      value instanceof NumberValue ||
      value instanceof BooleanValue ||
      value instanceof NullValue ||
      value instanceof UndefinedValue
    ) {
      // terminal values
      return value;
    } else if (value instanceof AbstractValue) {
      let length = value.args.length;
      if (length > 0) {
        let newBranchState = new BranchState();
        // TODO investigate what other kinds than "conditional" might be safe to deeply resolve
        for (let i = 0; i < length; i++) {
          value.args[i] = this._resolveDeeply(value.args[i], context, "NEW_BRANCH", newBranchState);
        }
        newBranchState.applyBranchedLogic(this.realm, this.reactSerializerState);
      }
      return value;
    }
    // TODO investigate what about other iterables type objects
    if (value instanceof ArrayValue) {
      this._resolveFragment(value, context, branchStatus, branchState);
      return value;
    }
    if (value instanceof ObjectValue && isReactElement(value)) {
      // we call value reactElement, to make it clearer what we're dealing with in this block
      let reactElement = value;
      let typeValue = Get(this.realm, reactElement, "type");
      let propsValue = Get(this.realm, reactElement, "props");
      let refValue = Get(this.realm, reactElement, "ref");
      if (typeValue instanceof StringValue) {
        // terminal host component. Start evaluating its children.
        if (propsValue instanceof ObjectValue) {
          let childrenProperty = propsValue.properties.get("children");
          if (childrenProperty) {
            let childrenPropertyDescriptor = childrenProperty.descriptor;
            // if the descriptor is undefined, the property is likely deleted, if it exists
            // proceed to resolve the children
            if (childrenPropertyDescriptor !== undefined) {
              let childrenPropertyValue = childrenPropertyDescriptor.value;
              invariant(childrenPropertyValue instanceof Value, `Bad "children" prop passed in JSXElement`);
              let resolvedChildren = this._resolveDeeply(childrenPropertyValue, context, branchStatus, branchState);
              childrenPropertyDescriptor.value = resolvedChildren;
            }
          }
        }
        return reactElement;
      }
      // we do not support "ref" on <Component /> ReactElements
      if (!(refValue instanceof NullValue)) {
        this._assignBailOutMessage(reactElement, `Bail-out: refs are not supported on <Components />`);
        return reactElement;
      }
      if (!(propsValue instanceof ObjectValue || propsValue instanceof AbstractObjectValue)) {
        this._assignBailOutMessage(
          reactElement,
          `Bail-out: props on <Component /> was not not an ObjectValue or an AbstractValue`
        );
        return reactElement;
      }
      let renderStrategy = this._getRenderStrategy(typeValue);

      if (renderStrategy === "NORMAL" && !(typeValue instanceof ECMAScriptSourceFunctionValue)) {
        this._assignBailOutMessage(
          reactElement,
          `Bail-out: type on <Component /> was not a ECMAScriptSourceFunctionValue`
        );
        return reactElement;
      }
      try {
        let result;
        switch (renderStrategy) {
          case "NORMAL": {
            let render = this._renderComponent(
              typeValue,
              propsValue,
              context,
              branchStatus === "NEW_BRANCH" ? "BRANCH" : branchStatus,
              null
            );
            result = render.result;
            break;
          }
          case "RELAY_QUERY_RENDERER": {
            let render = this._renderRelayQueryRendererComponent(reactElement, propsValue, context);
            result = render.result;
            break;
          }
          default:
            invariant(false, "unsupported render strategy");
        }

        if (result instanceof UndefinedValue) {
          this._assignBailOutMessage(reactElement, `Bail-out: undefined was returned from render`);
          if (branchStatus === "NEW_BRANCH" && branchState) {
            return branchState.captureBranchedValue(typeValue, reactElement);
          }
          return reactElement;
        }
        this.statistics.inlinedComponents++;
        if (branchStatus === "NEW_BRANCH" && branchState) {
          return branchState.captureBranchedValue(typeValue, result);
        }
        return result;
      } catch (error) {
        // assign a bail out message
        if (error instanceof ExpectedBailOut) {
          this._assignBailOutMessage(reactElement, "Bail-out: " + error.message);
        } else if (error instanceof FatalError) {
          this._assignBailOutMessage(reactElement, "Evaluation bail-out");
        } else {
          throw error;
        }
        // a child component bailed out during component folding, so return the function value and continue
        if (branchStatus === "NEW_BRANCH" && branchState) {
          return branchState.captureBranchedValue(typeValue, reactElement);
        }
        return reactElement;
      }
    } else {
      throw new ExpectedBailOut("unsupported value type during reconcilation");
    }
  }

  _assignBailOutMessage(reactElement: ObjectValue, message: string): void {
    // $BailOutReason is a field on ObjectValue that allows us to specify a message
    // that gets serialized as a comment node during the ReactElement serialization stage
    if (reactElement.$BailOutReason !== undefined) {
      // merge bail out messages if one already exists
      reactElement.$BailOutReason += `, ${message}`;
    } else {
      reactElement.$BailOutReason = message;
    }
  }

  _resolveFragment(
    arrayValue: ArrayValue,
    context: ObjectValue | AbstractObjectValue,
    branchStatus: BranchStatusEnum,
    branchState: BranchState | null
  ) {
    forEachArrayValue(this.realm, arrayValue, (elementValue, elementPropertyDescriptor) => {
      elementPropertyDescriptor.value = this._resolveDeeply(elementValue, context, branchStatus, branchState);
    });
  }
}
