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
import {
  AbstractValue,
  ECMAScriptSourceFunctionValue,
  Value,
  UndefinedValue,
  StringValue,
  NumberValue,
  BooleanValue,
  NullValue,
  ArrayValue,
  ObjectValue,
  AbstractObjectValue,
  FunctionValue,
  BoundFunctionValue,
} from "../values/index.js";
import { ReactStatistics, type ReactSerializerState, type ReactEvaluatedNode } from "../serializer/types.js";
import {
  isReactElement,
  valueIsClassComponent,
  forEachArrayValue,
  valueIsLegacyCreateClassComponent,
  valueIsFactoryClassComponent,
  valueIsKnownReactAbstraction,
  getReactSymbol,
  flattenChildren,
  getProperty,
  setProperty,
  createReactEvaluatedNode,
  getComponentName,
  sanitizeReactElementForFirstRenderOnly,
  getValueFromFunctionCall,
  evalauteWithNestedEffects,
} from "./utils";
import { Get } from "../methods/index.js";
import invariant from "../invariant.js";
import { CompilerDiagnostic, FatalError } from "../errors.js";
import { BranchState, type BranchStatusEnum } from "./branching.js";
import * as t from "babel-types";
import {
  getInitialProps,
  getInitialContext,
  createClassInstance,
  createSimpleClassInstance,
  evaluateClassConstructor,
  createClassInstanceForFirstRenderOnly,
} from "./components.js";
import { ExpectedBailOut, SimpleClassBailOut, NewComponentTreeBranch } from "./errors.js";
import { AbruptCompletion, Completion } from "../completions.js";
import { Logger } from "../utils/logger.js";
import type { ClassComponentMetadata, ReactComponentTreeConfig } from "../types.js";
import { createAbstractArgument } from "../intrinsics/prepack/utils.js";

type ComponentResolutionStrategy =
  | "NORMAL"
  | "FRAGMENT"
  | "RELAY_QUERY_RENDERER"
  | "CONTEXT_PROVIDER"
  | "CONTEXT_CONSUMER";

export type OptimizedClosure = {
  evaluatedNode: ReactEvaluatedNode,
  func: ECMAScriptSourceFunctionValue | BoundFunctionValue,
  nestedEffects: Array<Effects>,
  shouldResolve: boolean,
  componentType: Value | null,
  context: ObjectValue | AbstractObjectValue | null,
  branchState: BranchState | null,
};

export type BranchReactComponentTree = {
  context: ObjectValue | AbstractObjectValue | null,
  evaluatedNode: ReactEvaluatedNode,
  props: ObjectValue | AbstractObjectValue | null,
  rootValue: ECMAScriptSourceFunctionValue | AbstractValue,
};

export type ComponentTreeState = {
  branchedComponentTrees: Array<BranchReactComponentTree>,
  componentType: void | ECMAScriptSourceFunctionValue,
  deadEnds: number,
  optimizedClosures: Array<OptimizedClosure>,
  status: "SIMPLE" | "COMPLEX",
  contextNodeReferences: Map<ObjectValue | AbstractObjectValue, number>,
};

export class Reconciler {
  constructor(
    realm: Realm,
    logger: Logger,
    statistics: ReactStatistics,
    reactSerializerState: ReactSerializerState,
    componentTreeConfig: ReactComponentTreeConfig
  ) {
    this.realm = realm;
    this.statistics = statistics;
    this.reactSerializerState = reactSerializerState;
    this.logger = logger;
    this.componentTreeState = this._createComponentTreeState();
    this.alreadyEvaluatedRootNodes = new Map();
    this.alreadyEvaluatedNestedClosures = new Set();
    this.componentTreeConfig = componentTreeConfig;
    this.evaluatedFunctions = null;
  }

  realm: Realm;
  statistics: ReactStatistics;
  reactSerializerState: ReactSerializerState;
  logger: Logger;
  componentTreeState: ComponentTreeState;
  alreadyEvaluatedRootNodes: Map<ECMAScriptSourceFunctionValue, ReactEvaluatedNode>;
  alreadyEvaluatedNestedClosures: Set<FunctionValue>;
  componentTreeConfig: ReactComponentTreeConfig;
  currentEffectsStack: Array<Effects>;
  evaluatedFunctions: null | Set<FunctionValue>;

  renderReactComponentTree(
    componentType: ECMAScriptSourceFunctionValue,
    props: ObjectValue | AbstractObjectValue | null,
    context: ObjectValue | AbstractObjectValue | null,
    isRoot: boolean,
    evaluatedRootNode: ReactEvaluatedNode
  ): Effects {
    const renderComponentTree = () => {
      // initialProps and initialContext are created from Flow types from:
      // - if a functional component, the 1st and 2nd paramater of function
      // - if a class component, use this.props and this.context
      // if there are no Flow types for props or context, we will throw a
      // FatalError, unless it's a functional component that has no paramater
      // i.e let MyComponent = () => <div>Hello world</div>
      try {
        let initialProps = props || getInitialProps(this.realm, componentType);
        let initialContext = context || getInitialContext(this.realm, componentType);
        invariant(this instanceof Reconciler);
        this.realm.react.currentReconciler = this;
        let { result } = this._renderComponent(
          componentType,
          initialProps,
          initialContext,
          "ROOT",
          null,
          evaluatedRootNode
        );
        this.statistics.optimizedTrees++;
        this.alreadyEvaluatedRootNodes.set(componentType, evaluatedRootNode);
        return result;
      } catch (error) {
        if (error.name === "Invariant Violation") {
          throw error;
        }
        // if we get an error and we're not dealing with the root
        // rather than throw a FatalError, we log the error as a warning
        // and continue with the other tree roots
        // TODO: maybe control what levels gets treated as warning/error?
        if (!isRoot) {
          if (error instanceof AbruptCompletion) {
            this.logger.logWarning(
              componentType,
              `__optimizeReactComponentTree() React component tree (branch) failed due runtime runtime exception thrown`
            );
            evaluatedRootNode.status = "ABRUPT_COMPLETION";
          } else {
            this.logger.logWarning(
              componentType,
              `__optimizeReactComponentTree() React component tree (branch) failed due to - ${error.message}`
            );
            evaluatedRootNode.message = "evaluation failed on new component tree branch";
            evaluatedRootNode.status = "BAIL-OUT";
          }
          return this.realm.intrinsics.undefined;
        }
        if (error instanceof ExpectedBailOut) {
          let diagnostic = new CompilerDiagnostic(
            `__optimizeReactComponentTree() React component tree (root) failed due to - ${error.message}`,
            this.realm.currentLocation,
            "PP0020",
            "FatalError"
          );
          this.realm.handleError(diagnostic);
          if (this.realm.handleError(diagnostic) === "Fail") throw new FatalError();
        }
        throw error;
      } finally {
        this.realm.react.currentReconciler = null;
      }
    };

    let effects = this.realm.wrapInGlobalEnv(() =>
      this.realm.evaluatePure(() =>
        // TODO: (sebmarkbage): You could use the return value of this to detect if there are any mutations on objects other
        // than newly created ones. Then log those to the error logger. That'll help us track violations in
        // components. :)
        this.realm.evaluateForEffects(
          renderComponentTree,
          /*state*/ null,
          `react component: ${componentType.getName()}`
        )
      )
    );
    for (let { nestedEffects } of this.componentTreeState.optimizedClosures) {
      if (nestedEffects.length === 0) {
        nestedEffects.push(...nestedEffects, effects);
      }
    }
    return effects;
  }

  renderNestedOptimizedClosure(
    func: ECMAScriptSourceFunctionValue | BoundFunctionValue,
    nestedEffects: Array<Effects>,
    shouldResolve: boolean,
    componentType: Value | null,
    context: ObjectValue | AbstractObjectValue | null,
    branchState: BranchState | null,
    evaluatedNode: ReactEvaluatedNode
  ): Effects {
    const renderOptimizedClosure = () => {
      let numArgs = func.getLength();
      let args = [];
      let targetFunc = func;
      let baseObject = this.realm.$GlobalEnv.environmentRecord.WithBaseObject();

      this.alreadyEvaluatedNestedClosures.add(func);
      if (func instanceof BoundFunctionValue) {
        invariant(func.$BoundTargetFunction instanceof FunctionValue);
        targetFunc = func.$BoundTargetFunction;
        args.push(...func.$BoundArguments);
        this.alreadyEvaluatedNestedClosures.add(targetFunc);
      }
      invariant(targetFunc instanceof ECMAScriptSourceFunctionValue);
      let params = targetFunc.$FormalParameters;
      if (numArgs && numArgs > 0 && params) {
        for (let parameterId of params) {
          if (t.isIdentifier(parameterId)) {
            // Create an AbstractValue similar to __abstract being called
            args.push(
              createAbstractArgument(
                this.realm,
                ((parameterId: any): BabelNodeIdentifier).name,
                targetFunc.expressionLocation
              )
            );
          } else {
            this.realm.handleError(
              new CompilerDiagnostic(
                "Non-identifier args to additional functions unsupported",
                targetFunc.expressionLocation,
                "PP1005",
                "FatalError"
              )
            );
            throw new FatalError("Non-identifier args to additional functions unsupported");
          }
        }
      }
      invariant(this instanceof Reconciler);
      this.realm.react.currentReconciler = this;
      try {
        invariant(
          baseObject instanceof ObjectValue ||
            baseObject instanceof AbstractObjectValue ||
            baseObject instanceof UndefinedValue
        );
        let value = getValueFromFunctionCall(this.realm, func, baseObject, args, evaluatedNode);
        if (shouldResolve) {
          invariant(componentType instanceof Value);
          invariant(context instanceof ObjectValue || context instanceof AbstractObjectValue);
          let result = this._resolveDeeply(componentType, value, context, "NEW_BRANCH", branchState, evaluatedNode);
          this.statistics.optimizedNestedClosures++;
          return result;
        } else {
          this.statistics.optimizedNestedClosures++;
          return value;
        }
      } catch (error) {
        if (error.name === "Invariant Violation") {
          throw error;
        }
        return this.realm.intrinsics.undefined;
      } finally {
        // remove the our special "this" binding or it will try and make it global as it's intrinsic
        if (func instanceof BoundFunctionValue && func.$BoundThis.intrinsicName === "this") {
          func.$BoundThis = this.realm.intrinsics.undefined;
        }
        this.realm.react.currentReconciler = null;
      }
    };

    let effects = this.realm.wrapInGlobalEnv(() =>
      this.realm.evaluatePure(() =>
        this.realm.evaluateForEffects(
          () => evalauteWithNestedEffects(this.realm, nestedEffects, renderOptimizedClosure),
          /*state*/ null,
          `react nested optimized closure`
        )
      )
    );

    for (let { nestedEffects: nextNestedEffects } of this.componentTreeState.optimizedClosures) {
      if (nextNestedEffects.length === 0) {
        nextNestedEffects.push(effects, ...nestedEffects);
      }
    }
    return effects;
  }

  clearComponentTreeState(): void {
    this.componentTreeState = this._createComponentTreeState();
  }

  queueOptimizedClosure(
    func: ECMAScriptSourceFunctionValue | BoundFunctionValue,
    evaluatedNode: ReactEvaluatedNode,
    shouldResolve: boolean,
    componentType: Value | null,
    context: ObjectValue | AbstractObjectValue | null,
    branchState: BranchState | null
  ): void {
    let optimizedClosure = {
      evaluatedNode,
      func,
      nestedEffects: [],
      shouldResolve,
      componentType,
      context,
      branchState,
    };
    if (shouldResolve) {
      // closures that need to be resolved should be handled first
      this.componentTreeState.optimizedClosures.unshift(optimizedClosure);
    } else {
      this.componentTreeState.optimizedClosures.push(optimizedClosure);
    }
  }

  _queueNewComponentTree(
    rootValue: Value,
    evaluatedNode: ReactEvaluatedNode,
    nested?: boolean = false,
    props?: ObjectValue | AbstractObjectValue | null = null,
    context?: ObjectValue | AbstractObjectValue | null = null
  ) {
    invariant(rootValue instanceof ECMAScriptSourceFunctionValue || rootValue instanceof AbstractValue);
    this.componentTreeState.deadEnds++;
    this.componentTreeState.branchedComponentTrees.push({
      context,
      evaluatedNode,
      props,
      rootValue,
    });
  }

  _renderComplexClassComponent(
    componentType: ECMAScriptSourceFunctionValue,
    props: ObjectValue | AbstractValue | AbstractObjectValue,
    context: ObjectValue | AbstractObjectValue,
    classMetadata: ClassComponentMetadata,
    branchStatus: BranchStatusEnum,
    branchState: BranchState | null,
    evaluatedNode: ReactEvaluatedNode
  ): Value {
    if (branchStatus !== "ROOT") {
      // if the tree is simple and we're not in a branch, we can make this tree complex
      // and make this complex component the root
      let evaluatedComplexNode = this.alreadyEvaluatedRootNodes.get(componentType);
      if (
        branchStatus === "NO_BRANCH" &&
        this.componentTreeState.status === "SIMPLE" &&
        evaluatedComplexNode &&
        evaluatedComplexNode.status !== "RENDER_PROPS"
      ) {
        this.componentTreeState.componentType = componentType;
      } else {
        this._queueNewComponentTree(componentType, evaluatedNode);
        evaluatedNode.status = "NEW_TREE";
        throw new NewComponentTreeBranch();
      }
    }
    this.componentTreeState.status = "COMPLEX";
    // create a new instance of this React class component
    let instance = createClassInstance(this.realm, componentType, props, context, classMetadata);
    // get the "render" method off the instance
    let renderMethod = Get(this.realm, instance, "render");
    invariant(renderMethod instanceof ECMAScriptSourceFunctionValue);
    // the render method doesn't have any arguments, so we just assign the context of "this" to be the instance
    return getValueFromFunctionCall(this.realm, renderMethod, instance, [], evaluatedNode);
  }

  _renderSimpleClassComponent(
    componentType: ECMAScriptSourceFunctionValue,
    props: ObjectValue | AbstractValue | AbstractObjectValue,
    context: ObjectValue | AbstractObjectValue,
    branchStatus: BranchStatusEnum,
    branchState: BranchState | null,
    evaluatedNode: ReactEvaluatedNode
  ): Value {
    // create a new simple instance of this React class component
    let instance = createSimpleClassInstance(this.realm, componentType, props, context);
    // get the "render" method off the instance
    let renderMethod = Get(this.realm, instance, "render");
    invariant(renderMethod instanceof ECMAScriptSourceFunctionValue);
    // the render method doesn't have any arguments, so we just assign the context of "this" to be the instance
    return getValueFromFunctionCall(this.realm, renderMethod, instance, [], evaluatedNode);
  }

  _renderFunctionalComponent(
    componentType: ECMAScriptSourceFunctionValue,
    props: ObjectValue | AbstractValue | AbstractObjectValue,
    context: ObjectValue | AbstractObjectValue,
    evaluatedNode: ReactEvaluatedNode
  ) {
    return getValueFromFunctionCall(
      this.realm,
      componentType,
      this.realm.intrinsics.undefined,
      [props, context],
      evaluatedNode
    );
  }

  _getClassComponentMetadata(
    componentType: ECMAScriptSourceFunctionValue,
    props: ObjectValue | AbstractValue | AbstractObjectValue,
    context: ObjectValue | AbstractObjectValue
  ): ClassComponentMetadata {
    if (this.realm.react.classComponentMetadata.has(componentType)) {
      let classMetadata = this.realm.react.classComponentMetadata.get(componentType);
      invariant(classMetadata);
      return classMetadata;
    }
    // get all this assignments in the constructor
    let classMetadata = evaluateClassConstructor(this.realm, componentType, props, context);
    this.realm.react.classComponentMetadata.set(componentType, classMetadata);
    return classMetadata;
  }

  _resolveContextProviderComponent(
    componentType: Value,
    reactElement: ObjectValue,
    context: ObjectValue | AbstractObjectValue,
    branchStatus: BranchStatusEnum,
    branchState: BranchState | null,
    evaluatedNode: ReactEvaluatedNode
  ): Value {
    let typeValue = getProperty(this.realm, reactElement, "type");
    let propsValue = getProperty(this.realm, reactElement, "props");

    let evaluatedChildNode = createReactEvaluatedNode("NORMAL", "Context.Provider");
    evaluatedNode.children.push(evaluatedChildNode);
    this.statistics.componentsEvaluated++;
    invariant(typeValue instanceof ObjectValue || typeValue instanceof AbstractObjectValue);
    const contextConsumer = getProperty(this.realm, typeValue, "context");
    invariant(contextConsumer instanceof ObjectValue || contextConsumer instanceof AbstractObjectValue);
    let lastValueProp = getProperty(this.realm, contextConsumer, "currentValue");
    this._incremementReferenceForContextNode(contextConsumer);

    const setContextCurrentValue = value => {
      if (value instanceof Value) {
        // update the currentValue
        setProperty(contextConsumer, "currentValue", value);
      }
    };
    // if we have a value prop, set it
    if (propsValue instanceof ObjectValue || propsValue instanceof AbstractObjectValue) {
      let valueProp = Get(this.realm, propsValue, "value");
      setContextCurrentValue(valueProp);
    }
    if (this.componentTreeConfig.firstRenderOnly) {
      if (propsValue instanceof ObjectValue) {
        this._resolveReactElementHostChildren(
          componentType,
          reactElement,
          context,
          branchStatus,
          branchState,
          evaluatedChildNode
        );
        setContextCurrentValue(lastValueProp);
        this._decremementReferenceForContextNode(contextConsumer);
        // if we no dead ends, we know the rest of the tree and can safely remove the provider
        if (this.componentTreeState.deadEnds === 0) {
          let childrenValue = Get(this.realm, propsValue, "children");
          evaluatedChildNode.status = "INLINED";
          this.statistics.inlinedComponents++;
          return childrenValue;
        }
        return reactElement;
      }
    }
    let children = this._resolveReactElementHostChildren(
      componentType,
      reactElement,
      context,
      branchStatus,
      branchState,
      evaluatedChildNode
    );
    setContextCurrentValue(lastValueProp);
    this._decremementReferenceForContextNode(contextConsumer);
    return children;
  }

  _decremementReferenceForContextNode(contextNode: ObjectValue | AbstractObjectValue): void {
    let references = this.componentTreeState.contextNodeReferences.get(contextNode);
    if (!references) {
      references = 0;
    } else {
      references--;
    }
    this.componentTreeState.contextNodeReferences.set(contextNode, references);
  }

  _incremementReferenceForContextNode(contextNode: ObjectValue | AbstractObjectValue): void {
    let references = this.componentTreeState.contextNodeReferences.get(contextNode);
    if (!references) {
      references = 1;
    } else {
      references++;
    }
    this.componentTreeState.contextNodeReferences.set(contextNode, references);
  }

  _hasReferenceForContextNode(contextNode: ObjectValue | AbstractObjectValue): boolean {
    if (this.componentTreeState.contextNodeReferences.has(contextNode)) {
      let references = this.componentTreeState.contextNodeReferences.get(contextNode);
      if (!references) {
        return false;
      }
      return references > 0;
    }
    return false;
  }

  _resolveContextConsumerComponent(
    componentType: Value,
    reactElement: ObjectValue,
    context: ObjectValue | AbstractObjectValue,
    branchState: BranchState | null,
    evaluatedNode: ReactEvaluatedNode
  ): Value | void {
    let typeValue = getProperty(this.realm, reactElement, "type");
    let propsValue = getProperty(this.realm, reactElement, "props");
    let evaluatedChildNode = createReactEvaluatedNode("RENDER_PROPS", "Context.Consumer");
    evaluatedNode.children.push(evaluatedChildNode);

    if (propsValue instanceof ObjectValue || propsValue instanceof AbstractObjectValue) {
      // get the "render" prop child off the instance
      let renderProp = Get(this.realm, propsValue, "children");
      if (renderProp instanceof ECMAScriptSourceFunctionValue) {
        if (this.componentTreeConfig.firstRenderOnly) {
          if (typeValue instanceof ObjectValue || typeValue instanceof AbstractObjectValue) {
            // make sure this context is in our tree
            if (this._hasReferenceForContextNode(typeValue)) {
              let valueProp = Get(this.realm, typeValue, "currentValue");
              let result = getValueFromFunctionCall(
                this.realm,
                renderProp,
                this.realm.intrinsics.undefined,
                [valueProp],
                evaluatedNode
              );
              this.statistics.inlinedComponents++;
              this.statistics.componentsEvaluated++;
              evaluatedChildNode.status = "INLINED";
              return result;
            }
          }
        }
        this.queueOptimizedClosure(renderProp, evaluatedChildNode, true, componentType, context, branchState);
        return;
      } else {
        this._findReactComponentTrees(propsValue, evaluatedChildNode);
        return;
      }
    }
    this.componentTreeState.deadEnds++;
    return;
  }

  _resolveRelayQueryRendererComponent(
    componentType: Value,
    reactElement: ObjectValue,
    context: ObjectValue | AbstractObjectValue,
    branchState: BranchState | null,
    evaluatedNode: ReactEvaluatedNode
  ): Value | void {
    let typeValue = getProperty(this.realm, reactElement, "type");
    let propsValue = getProperty(this.realm, reactElement, "props");

    let evaluatedChildNode = createReactEvaluatedNode("RENDER_PROPS", getComponentName(this.realm, typeValue));
    evaluatedNode.children.push(evaluatedChildNode);

    if (propsValue instanceof ObjectValue || propsValue instanceof AbstractObjectValue) {
      // get the "render" method off the instance
      let renderProp = Get(this.realm, propsValue, "render");
      if (renderProp instanceof ECMAScriptSourceFunctionValue) {
        this.queueOptimizedClosure(renderProp, evaluatedChildNode, true, componentType, context, branchState);
      } else {
        this._findReactComponentTrees(propsValue, evaluatedChildNode);
      }
      return;
    }
    // this is the worst case, we were unable to find the render prop function
    // and won't be able to find any further components to evaluate as trees
    // because of that
    this.componentTreeState.deadEnds++;
    return;
  }

  _renderClassComponent(
    componentType: ECMAScriptSourceFunctionValue,
    props: ObjectValue | AbstractValue | AbstractObjectValue,
    context: ObjectValue | AbstractObjectValue,
    branchStatus: BranchStatusEnum,
    branchState: BranchState | null,
    evaluatedNode: ReactEvaluatedNode
  ): Value {
    let value;

    let classMetadata = this._getClassComponentMetadata(componentType, props, context);
    let { instanceProperties, instanceSymbols } = classMetadata;

    // if there were no this assignments we can try and render it as a simple class component
    if (instanceProperties.size === 0 && instanceSymbols.size === 0) {
      // We first need to know what type of class component we're dealing with.
      // A "simple" class component is defined as:
      //
      // - having only a "render" method
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
        value = this._renderSimpleClassComponent(
          componentType,
          props,
          context,
          branchStatus,
          branchState,
          evaluatedNode
        );
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
        branchState,
        evaluatedNode
      );
    }
    return value;
  }

  _renderClassComponentForFirstRenderOnly(
    componentType: ECMAScriptSourceFunctionValue,
    props: ObjectValue | AbstractValue | AbstractObjectValue,
    context: ObjectValue | AbstractObjectValue,
    branchStatus: BranchStatusEnum,
    branchState: BranchState | null,
    evaluatedNode: ReactEvaluatedNode
  ): Value {
    // create a new simple instance of this React class component
    let instance = createClassInstanceForFirstRenderOnly(this.realm, componentType, props, context, evaluatedNode);
    // get the "componentWillMount" and "render" methods off the instance
    let componentWillMount = Get(this.realm, instance, "componentWillMount");
    let renderMethod = Get(this.realm, instance, "render");

    if (componentWillMount instanceof ECMAScriptSourceFunctionValue && componentWillMount.$Call) {
      componentWillMount.$Call(instance, []);
    }
    invariant(renderMethod instanceof ECMAScriptSourceFunctionValue);
    return getValueFromFunctionCall(this.realm, renderMethod, instance, [], evaluatedNode);
  }

  _renderComponent(
    componentType: Value,
    props: ObjectValue | AbstractValue | AbstractObjectValue,
    context: ObjectValue | AbstractObjectValue,
    branchStatus: BranchStatusEnum,
    branchState: BranchState | null,
    evaluatedNode: ReactEvaluatedNode
  ) {
    this.statistics.componentsEvaluated++;
    if (valueIsKnownReactAbstraction(this.realm, componentType)) {
      invariant(componentType instanceof AbstractValue);
      this._queueNewComponentTree(componentType, evaluatedNode);
      evaluatedNode.status = "NEW_TREE";
      evaluatedNode.message = "RelayContainer";
      throw new NewComponentTreeBranch();
    }
    invariant(componentType instanceof ECMAScriptSourceFunctionValue);
    let value;
    let childContext = context;

    // first we check if it's a legacy class component
    if (valueIsLegacyCreateClassComponent(this.realm, componentType)) {
      throw new ExpectedBailOut("components created with create-react-class are not supported");
    } else if (valueIsClassComponent(this.realm, componentType)) {
      if (this.componentTreeConfig.firstRenderOnly) {
        value = this._renderClassComponentForFirstRenderOnly(
          componentType,
          props,
          context,
          branchStatus,
          branchState,
          evaluatedNode
        );
      } else {
        value = this._renderClassComponent(componentType, props, context, branchStatus, branchState, evaluatedNode);
      }
    } else {
      value = this._renderFunctionalComponent(componentType, props, context, evaluatedNode);
      if (valueIsFactoryClassComponent(this.realm, value)) {
        invariant(value instanceof ObjectValue);
        if (branchStatus !== "ROOT") {
          throw new ExpectedBailOut("non-root factory class components are not suppoted");
        } else {
          // TODO support factory components
          return {
            result: value,
            childContext,
          };
        }
      }
    }
    invariant(value !== undefined);
    return {
      result: this._resolveDeeply(
        componentType,
        value,
        context,
        branchStatus === "ROOT" ? "NO_BRANCH" : branchStatus,
        branchState,
        evaluatedNode
      ),
      childContext,
    };
  }

  _createComponentTreeState(): ComponentTreeState {
    return {
      branchedComponentTrees: [],
      componentType: undefined,
      deadEnds: 0,
      optimizedClosures: [],
      status: "SIMPLE",
      contextNodeReferences: new Map(),
    };
  }

  _getComponentResolutionStrategy(value: Value): ComponentResolutionStrategy {
    // check if it's a ReactRelay.QueryRenderer
    if (this.realm.fbLibraries.reactRelay !== undefined) {
      let QueryRenderer = getProperty(this.realm, this.realm.fbLibraries.reactRelay, "QueryRenderer");
      if (value === QueryRenderer) {
        return "RELAY_QUERY_RENDERER";
      }
    }
    if (value === getReactSymbol("react.fragment", this.realm)) {
      return "FRAGMENT";
    }
    if (value instanceof ObjectValue || value instanceof AbstractObjectValue) {
      let $$typeof = Get(this.realm, value, "$$typeof");

      if ($$typeof === getReactSymbol("react.context", this.realm)) {
        return "CONTEXT_CONSUMER";
      }
      if ($$typeof === getReactSymbol("react.provider", this.realm)) {
        return "CONTEXT_PROVIDER";
      }
    }
    return "NORMAL";
  }

  _resolveAbstractValue(
    componentType: Value,
    value: AbstractValue,
    context: ObjectValue | AbstractObjectValue,
    branchStatus: BranchStatusEnum,
    branchState: BranchState | null,
    evaluatedNode: ReactEvaluatedNode
  ) {
    let length = value.args.length;
    if (length > 0) {
      let newBranchState = new BranchState();
      // TODO investigate what other kinds than "conditional" might be safe to deeply resolve
      for (let i = 0; i < length; i++) {
        value.args[i] = this._resolveDeeply(
          componentType,
          value.args[i],
          context,
          "NEW_BRANCH",
          newBranchState,
          evaluatedNode
        );
      }
      newBranchState.applyBranchedLogic(this.realm, this.reactSerializerState);
    } else {
      this.componentTreeState.deadEnds++;
    }
    return value;
  }

  _resolveUnknownComponentType(reactElement: ObjectValue, evaluatedNode: ReactEvaluatedNode) {
    let typeValue = getProperty(this.realm, reactElement, "type");
    let propsValue = getProperty(this.realm, reactElement, "props");

    this._findReactComponentTrees(propsValue, evaluatedNode);
    if (typeValue instanceof AbstractValue) {
      this._findReactComponentTrees(typeValue, evaluatedNode);
      return reactElement;
    } else {
      let evaluatedChildNode = createReactEvaluatedNode("BAIL-OUT", getComponentName(this.realm, typeValue));
      evaluatedNode.children.push(evaluatedChildNode);
      let bailOutMessage = `type on <Component /> was not a ECMAScriptSourceFunctionValue`;
      evaluatedChildNode.message = bailOutMessage;
      this._assignBailOutMessage(reactElement, bailOutMessage);
      this.componentTreeState.deadEnds++;
      return reactElement;
    }
  }

  _resolveReactElementBadRef(reactElement: ObjectValue, evaluatedNode: ReactEvaluatedNode) {
    let typeValue = getProperty(this.realm, reactElement, "type");
    let propsValue = getProperty(this.realm, reactElement, "props");

    let evaluatedChildNode = createReactEvaluatedNode("BAIL-OUT", getComponentName(this.realm, typeValue));
    evaluatedNode.children.push(evaluatedChildNode);
    let bailOutMessage = `refs are not supported on <Components />`;
    evaluatedChildNode.message = bailOutMessage;

    this._queueNewComponentTree(typeValue, evaluatedChildNode);
    this._findReactComponentTrees(propsValue, evaluatedNode);
    this._assignBailOutMessage(reactElement, bailOutMessage);
    return reactElement;
  }

  _resolveReactElementUndefinedRender(
    reactElement: ObjectValue,
    evaluatedNode: ReactEvaluatedNode,
    branchStatus: BranchStatusEnum,
    branchState: BranchState | null
  ) {
    let typeValue = getProperty(this.realm, reactElement, "type");
    let propsValue = getProperty(this.realm, reactElement, "props");

    let evaluatedChildNode = createReactEvaluatedNode("BAIL-OUT", getComponentName(this.realm, typeValue));
    evaluatedNode.children.push(evaluatedChildNode);
    let bailOutMessage = `undefined was returned from render`;
    evaluatedChildNode.message = bailOutMessage;

    this._assignBailOutMessage(reactElement, bailOutMessage);
    this._findReactComponentTrees(propsValue, evaluatedNode);
    if (branchStatus === "NEW_BRANCH" && branchState) {
      return branchState.captureBranchedValue(typeValue, reactElement);
    }
    return reactElement;
  }

  _resolveReactElementHostChildren(
    componentType: Value,
    reactElement: ObjectValue,
    context: ObjectValue | AbstractObjectValue,
    branchStatus: BranchStatusEnum,
    branchState: BranchState | null,
    evaluatedNode: ReactEvaluatedNode
  ) {
    let propsValue = getProperty(this.realm, reactElement, "props");
    // terminal host component. Start evaluating its children.
    if (propsValue instanceof ObjectValue && propsValue.properties.has("children")) {
      let childrenValue = Get(this.realm, propsValue, "children");

      if (childrenValue instanceof Value) {
        let resolvedChildren = this._resolveDeeply(
          componentType,
          childrenValue,
          context,
          branchStatus,
          branchState,
          evaluatedNode
        );
        // we can optimize further and flatten arrays on non-composite components
        if (resolvedChildren instanceof ArrayValue) {
          resolvedChildren = flattenChildren(this.realm, resolvedChildren);
        }
        if (propsValue.properties.has("children")) {
          propsValue.refuseSerialization = true;
          setProperty(propsValue, "children", resolvedChildren);
          propsValue.refuseSerialization = false;
        }
      }
    }
    return reactElement;
  }

  _resolveFragmentComponent(
    componentType: Value,
    reactElement: ObjectValue,
    context: ObjectValue | AbstractObjectValue,
    branchStatus: BranchStatusEnum,
    branchState: BranchState | null,
    evaluatedNode: ReactEvaluatedNode
  ) {
    this.statistics.componentsEvaluated++;
    if (this.componentTreeConfig.firstRenderOnly) {
      let evaluatedChildNode = createReactEvaluatedNode("INLINED", "React.Fragment");
      evaluatedNode.children.push(evaluatedChildNode);
      this.statistics.inlinedComponents++;
      let children = this._resolveReactElementHostChildren(
        componentType,
        reactElement,
        context,
        branchStatus,
        branchState,
        evaluatedChildNode
      );
      return children;
    } else {
      let evaluatedChildNode = createReactEvaluatedNode("NORMAL", "React.Fragment");
      evaluatedNode.children.push(evaluatedChildNode);
      return this._resolveReactElementHostChildren(
        componentType,
        reactElement,
        context,
        branchStatus,
        branchState,
        evaluatedChildNode
      );
    }
  }

  _resolveReactElement(
    componentType: Value,
    reactElement: ObjectValue,
    context: ObjectValue | AbstractObjectValue,
    branchStatus: BranchStatusEnum,
    branchState: BranchState | null,
    evaluatedNode: ReactEvaluatedNode
  ) {
    reactElement = this.componentTreeConfig.firstRenderOnly
      ? sanitizeReactElementForFirstRenderOnly(this.realm, reactElement)
      : reactElement;

    let typeValue = getProperty(this.realm, reactElement, "type");
    let propsValue = getProperty(this.realm, reactElement, "props");
    let refValue = getProperty(this.realm, reactElement, "ref");

    if (typeValue instanceof StringValue) {
      return this._resolveReactElementHostChildren(
        componentType,
        reactElement,
        context,
        branchStatus,
        branchState,
        evaluatedNode
      );
    }
    // we do not support "ref" on <Component /> ReactElements
    if (!(refValue instanceof NullValue)) {
      this._resolveReactElementBadRef(reactElement, evaluatedNode);
    }
    if (
      !(
        propsValue instanceof ObjectValue ||
        propsValue instanceof AbstractObjectValue ||
        propsValue instanceof AbstractValue
      )
    ) {
      this._assignBailOutMessage(reactElement, `props on <Component /> was not not an ObjectValue or an AbstractValue`);
      return reactElement;
    }
    let componentResolutionStrategy = this._getComponentResolutionStrategy(typeValue);

    try {
      let result;

      switch (componentResolutionStrategy) {
        case "NORMAL": {
          if (
            !(typeValue instanceof ECMAScriptSourceFunctionValue || valueIsKnownReactAbstraction(this.realm, typeValue))
          ) {
            return this._resolveUnknownComponentType(reactElement, evaluatedNode);
          }
          let evaluatedChildNode = createReactEvaluatedNode("INLINED", getComponentName(this.realm, typeValue));
          evaluatedNode.children.push(evaluatedChildNode);
          let render = this._renderComponent(
            typeValue,
            propsValue,
            context,
            branchStatus === "NEW_BRANCH" ? "BRANCH" : branchStatus,
            null,
            evaluatedChildNode
          );
          result = render.result;
          this.statistics.inlinedComponents++;
          break;
        }
        case "FRAGMENT": {
          return this._resolveFragmentComponent(
            componentType,
            reactElement,
            context,
            branchStatus,
            branchState,
            evaluatedNode
          );
        }
        case "RELAY_QUERY_RENDERER": {
          invariant(typeValue instanceof AbstractObjectValue);
          result = this._resolveRelayQueryRendererComponent(
            componentType,
            reactElement,
            context,
            branchState,
            evaluatedNode
          );
          break;
        }
        case "CONTEXT_PROVIDER": {
          return this._resolveContextProviderComponent(
            componentType,
            reactElement,
            context,
            branchStatus,
            branchState,
            evaluatedNode
          );
        }
        case "CONTEXT_CONSUMER": {
          result = this._resolveContextConsumerComponent(
            componentType,
            reactElement,
            context,
            branchState,
            evaluatedNode
          );
          break;
        }
        default:
          invariant(false, "unsupported component resolution strategy");
      }

      if (result === undefined) {
        result = reactElement;
      }
      if (result instanceof UndefinedValue) {
        return this._resolveReactElementUndefinedRender(reactElement, evaluatedNode, branchStatus, branchState);
      }
      if (branchStatus === "NEW_BRANCH" && branchState) {
        return branchState.captureBranchedValue(typeValue, result);
      }
      return result;
    } catch (error) {
      return this._resolveComponentResolutionFailure(error, reactElement, evaluatedNode, branchStatus, branchState);
    }
  }

  _resolveComponentResolutionFailure(
    error: Error | Completion,
    reactElement: ObjectValue,
    evaluatedNode: ReactEvaluatedNode,
    branchStatus: BranchStatusEnum,
    branchState: BranchState | null
  ): Value {
    if (error.name === "Invariant Violation") {
      throw error;
    }
    let typeValue = getProperty(this.realm, reactElement, "type");
    let propsValue = getProperty(this.realm, reactElement, "props");
    // assign a bail out message
    if (error instanceof NewComponentTreeBranch) {
      // NO-OP (we don't queue a newComponentTree as this was already done)
    } else {
      // handle abrupt completions
      if (error instanceof AbruptCompletion) {
        let evaluatedChildNode = createReactEvaluatedNode("ABRUPT_COMPLETION", getComponentName(this.realm, typeValue));
        evaluatedNode.children.push(evaluatedChildNode);
      } else {
        let evaluatedChildNode = createReactEvaluatedNode("BAIL-OUT", getComponentName(this.realm, typeValue));
        evaluatedNode.children.push(evaluatedChildNode);
        this._queueNewComponentTree(typeValue, evaluatedChildNode);
        this._findReactComponentTrees(propsValue, evaluatedNode);
        if (error instanceof ExpectedBailOut) {
          evaluatedChildNode.message = error.message;
          this._assignBailOutMessage(reactElement, error.message);
        } else if (error instanceof FatalError) {
          let message = "evaluation failed";
          evaluatedChildNode.message = message;
          this._assignBailOutMessage(reactElement, message);
        } else {
          evaluatedChildNode.message = `unknown error`;
          throw error;
        }
      }
    }
    // a child component bailed out during component folding, so return the function value and continue
    if (branchStatus === "NEW_BRANCH" && branchState) {
      return branchState.captureBranchedValue(typeValue, reactElement);
    }
    return reactElement;
  }

  _resolveDeeply(
    componentType: Value,
    value: Value,
    context: ObjectValue | AbstractObjectValue,
    branchStatus: BranchStatusEnum,
    branchState: BranchState | null,
    evaluatedNode: ReactEvaluatedNode
  ): Value {
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
      return this._resolveAbstractValue(componentType, value, context, branchStatus, branchState, evaluatedNode);
    }
    // TODO investigate what about other iterables type objects
    if (value instanceof ArrayValue) {
      this._resolveArray(componentType, value, context, branchStatus, branchState, evaluatedNode);
      return value;
    }
    if (value instanceof ObjectValue && isReactElement(value)) {
      return this._resolveReactElement(componentType, value, context, branchStatus, branchState, evaluatedNode);
    } else {
      throw new ExpectedBailOut("unsupported value type during reconcilation");
    }
  }

  _assignBailOutMessage(reactElement: ObjectValue, message: string): void {
    // $BailOutReason is a field on ObjectValue that allows us to specify a message
    // that gets serialized as a comment node during the ReactElement serialization stage
    message = `Bail-out: ${message}`;
    if (reactElement.$BailOutReason !== undefined) {
      // merge bail out messages if one already exists
      reactElement.$BailOutReason += `, ${message}`;
    } else {
      reactElement.$BailOutReason = message;
    }
  }

  _resolveArray(
    componentType: Value,
    arrayValue: ArrayValue,
    context: ObjectValue | AbstractObjectValue,
    branchStatus: BranchStatusEnum,
    branchState: BranchState | null,
    evaluatedNode: ReactEvaluatedNode
  ) {
    forEachArrayValue(this.realm, arrayValue, (elementValue, elementPropertyDescriptor) => {
      elementPropertyDescriptor.value = this._resolveDeeply(
        componentType,
        elementValue,
        context,
        "NEW_BRANCH",
        branchState,
        evaluatedNode
      );
    });
  }

  hasEvaluatedRootNode(componentType: ECMAScriptSourceFunctionValue, evaluateNode: ReactEvaluatedNode): boolean {
    if (this.alreadyEvaluatedRootNodes.has(componentType)) {
      let alreadyEvaluatedNode = this.alreadyEvaluatedRootNodes.get(componentType);
      invariant(alreadyEvaluatedNode);
      evaluateNode.children = alreadyEvaluatedNode.children;
      evaluateNode.status = alreadyEvaluatedNode.status;
      evaluateNode.name = alreadyEvaluatedNode.name;
      return true;
    }
    return false;
  }

  hasEvaluatedNestedClosure(func: ECMAScriptSourceFunctionValue | BoundFunctionValue): boolean {
    return this.alreadyEvaluatedNestedClosures.has(func);
  }

  _findReactComponentTrees(value: Value, evaluatedNode: ReactEvaluatedNode): void {
    if (value instanceof AbstractValue) {
      if (value.args.length > 0) {
        for (let arg of value.args) {
          this._findReactComponentTrees(arg, evaluatedNode);
        }
      } else {
        this.componentTreeState.deadEnds++;
      }
    } else if (value instanceof ObjectValue) {
      for (let [propName, binding] of value.properties) {
        if (binding && binding.descriptor && binding.descriptor.enumerable) {
          this._findReactComponentTrees(getProperty(this.realm, value, propName), evaluatedNode);
        }
      }
    } else if (value instanceof ECMAScriptSourceFunctionValue || valueIsKnownReactAbstraction(this.realm, value)) {
      let evaluatedChildNode = createReactEvaluatedNode("NEW_TREE", getComponentName(this.realm, value));
      evaluatedNode.children.push(evaluatedChildNode);
      this._queueNewComponentTree(value, evaluatedChildNode);
    }
  }
}
