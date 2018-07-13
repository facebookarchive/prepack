// flow-typed signature: 809a8a23ed790a6069fbd9e9c47f850b
// flow-typed version: a80240470a/react-relay_v1.x.x/flow_>=v0.47.x

import * as React from 'react';

declare module "react-relay" {
  declare export type RecordState = "EXISTENT" | "NONEXISTENT" | "UNKNOWN";

  declare export type onCompleted = (
    response: ?Object,
    errors: ?Array<PayloadError>
  ) => void;
  declare export type onError = (error: Error) => void;

  declare export type CommitOptions = {
    onCompleted: onCompleted,
    onError: onError
  };

  /**
   * Ideally this would be a union of Field/Fragment/Mutation/Query/Subscription,
   * but that causes lots of Flow errors.
   */
  declare export type ConcreteBatchCallVariable = {
    jsonPath: string,
    kind: "BatchCallVariable",
    sourceQueryID: string
  };
  declare export type ConcreteCall = {
    kind: "Call",
    metadata: {
      type?: ?string
    },
    name: string,
    value: ?ConcreteValue
  };
  declare export type ConcreteCallValue = {
    callValue: mixed,
    kind: "CallValue"
  };
  declare export type ConcreteCallVariable = {
    callVariableName: string,
    kind: "CallVariable"
  };
  declare export type ConcreteDirective = {
    args: Array<ConcreteDirectiveArgument>,
    kind: "Directive",
    name: string
  };
  declare export type ConcreteDirectiveArgument = {
    name: string,
    value: ?ConcreteDirectiveValue
  };
  declare export type ConcreteDirectiveValue =
    | ConcreteCallValue
    | ConcreteCallVariable
    | Array<ConcreteCallValue | ConcreteCallVariable>;
  declare export type ConcreteFieldMetadata = {
    canHaveSubselections?: ?boolean,
    inferredPrimaryKey?: ?string,
    inferredRootCallName?: ?string,
    isAbstract?: boolean,
    isConnection?: boolean,
    isConnectionWithoutNodeID?: boolean,
    isFindable?: boolean,
    isGenerated?: boolean,
    isPlural?: boolean,
    isRequisite?: boolean
  };
  declare export type ConcreteFragmentMetadata = {
    isAbstract?: boolean,
    pattern?: boolean,
    plural?: boolean
  };
  declare export type ConcreteMutation = {
    calls: Array<ConcreteCall>,
    children?: ?Array<?ConcreteSelection>,
    directives?: ?Array<ConcreteDirective>,
    kind: "Mutation",
    metadata: {
      inputType?: ?string
    },
    name: string,
    responseType: string
  };
  declare export type ConcreteOperationMetadata = {
    inputType?: ?string
  };
  declare export type ConcreteQuery = {
    calls?: ?Array<ConcreteCall>,
    children?: ?Array<?ConcreteSelection>,
    directives?: ?Array<ConcreteDirective>,
    fieldName: string,
    isDeferred?: boolean,
    kind: "Query",
    metadata: {
      identifyingArgName?: ?string,
      identifyingArgType?: ?string,
      isAbstract?: ?boolean,
      isPlural?: ?boolean
    },
    name: string,
    type: string
  };
  declare export type ConcreteQueryMetadata = {
    identifyingArgName: ?string,
    identifyingArgType: ?string,
    isAbstract: ?boolean,
    isDeferred: ?boolean,
    isPlural: ?boolean
  };
  declare export type ConcreteSubscription = {
    calls: Array<ConcreteCall>,
    children?: ?Array<?ConcreteSelection>,
    directives?: ?Array<ConcreteDirective>,
    kind: "Subscription",
    name: string,
    responseType: string,
    metadata: {
      inputType?: ?string
    }
  };
  declare export type ConcreteValue =
    | ConcreteBatchCallVariable
    | ConcreteCallValue
    | ConcreteCallVariable
    | Array<ConcreteCallValue | ConcreteCallVariable>;

  /**
   * The output of a graphql-tagged fragment definition.
   */
  declare export type ConcreteFragmentDefinition = {
    kind: "FragmentDefinition",
    argumentDefinitions: Array<ConcreteArgumentDefinition>,
    node: ConcreteFragment
  };

  declare export type ConcreteLocalArgumentDefinition = {
    kind: "LocalArgument",
    name: string,
    defaultValue: mixed
  };

  declare export type ConcreteRootArgumentDefinition = {
    kind: "RootArgument",
    name: string
  };

  /**
   * The output of a graphql-tagged operation definition.
   */
  declare export type ConcreteOperationDefinition = {
    kind: "OperationDefinition",
    argumentDefinitions: Array<ConcreteLocalArgumentDefinition>,
    name: string,
    operation: "mutation" | "query" | "subscription",
    node: ConcreteFragment | ConcreteMutation | ConcreteSubscription
  };

  declare export type ConcreteArgument = ConcreteLiteral | ConcreteVariable;
  declare export type ConcreteArgumentDefinition =
    | ConcreteLocalArgument
    | ConcreteRootArgument;
  /**
   * Represents a single ConcreteRoot along with metadata for processing it at
   * runtime. The persisted `id` (or `text`) can be used to fetch the query,
   * the `fragment` can be used to read the root data (masking data from child
   * fragments), and the `query` can be used to normalize server responses.
   *
   * NOTE: The use of "batch" in the name is intentional, as this wrapper around
   * the ConcreteRoot will provide a place to store multiple concrete nodes that
   * are part of the same batch, e.g. in the case of deferred nodes or
   * for streaming connections that are represented as distinct concrete roots but
   * are still conceptually tied to one source query.
   */
  declare export type ConcreteBatch = {
    kind: "Batch",
    fragment: ConcreteFragment,
    id: ?string,
    metadata: { [key: string]: mixed },
    name: string,
    query: ConcreteRoot,
    text: ?string
  };
  declare export type ConcreteCondition = {
    kind: "Condition",
    passingValue: boolean,
    condition: string,
    selections: Array<ConcreteSelection>
  };
  declare export type ConcreteField = ConcreteScalarField | ConcreteLinkedField;
  declare export type ConcreteFragment = {
    argumentDefinitions: Array<ConcreteArgumentDefinition>,
    kind: "Fragment",
    metadata: ?{ [key: string]: mixed },
    name: string,
    selections: Array<ConcreteSelection>,
    type: string
  };
  declare export type ConcreteFragmentSpread = {
    args: ?Array<ConcreteArgument>,
    kind: "FragmentSpread",
    name: string
  };
  declare export type ConcreteHandle =
    | ConcreteScalarHandle
    | ConcreteLinkedHandle;
  declare export type ConcreteRootArgument = {
    kind: "RootArgument",
    name: string,
    type: ?string
  };
  declare export type ConcreteInlineFragment = {
    kind: "InlineFragment",
    selections: Array<ConcreteSelection>,
    type: string
  };
  declare export type ConcreteLinkedField = {
    alias: ?string,
    args: ?Array<ConcreteArgument>,
    concreteType: ?string,
    kind: "LinkedField",
    name: string,
    plural: boolean,
    selections: Array<ConcreteSelection>,
    storageKey: ?string
  };
  declare export type ConcreteLinkedHandle = {
    alias: ?string,
    args: ?Array<ConcreteArgument>,
    kind: "LinkedHandle",
    name: string,
    handle: string,
    key: string,
    filters: ?Array<string>
  };
  declare export type ConcreteLiteral = {
    kind: "Literal",
    name: string,
    type: ?string,
    value: mixed
  };
  declare export type ConcreteLocalArgument = {
    defaultValue: mixed,
    kind: "LocalArgument",
    name: string,
    type: string
  };
  declare export type ConcreteNode =
    | ConcreteCondition
    | ConcreteLinkedField
    | ConcreteFragment
    | ConcreteInlineFragment
    | ConcreteRoot;
  declare export type ConcreteRoot = {
    argumentDefinitions: Array<ConcreteLocalArgument>,
    kind: "Root",
    name: string,
    operation: "mutation" | "query" | "subscription",
    selections: Array<ConcreteSelection>
  };
  declare export type ConcreteScalarField = {
    alias: ?string,
    args: ?Array<ConcreteArgument>,
    kind: "ScalarField",
    name: string,
    storageKey: ?string
  };
  declare export type ConcreteScalarHandle = {
    alias: ?string,
    args: ?Array<ConcreteArgument>,
    kind: "ScalarHandle",
    name: string,
    handle: string,
    key: string,
    filters: ?Array<string>
  };
  declare export type ConcreteSelection =
    | ConcreteCondition
    | ConcreteField
    | ConcreteFragmentSpread
    | ConcreteHandle
    | ConcreteInlineFragment;
  declare export type ConcreteVariable = {
    kind: "Variable",
    name: string,
    type: ?string,
    variableName: string
  };
  declare export type ConcreteSelectableNode = ConcreteFragment | ConcreteRoot;
  declare export type GeneratedNode = ConcreteBatch | ConcreteFragment;

  // The type of a graphql`...` tagged template expression.
  declare export type GraphQLTaggedNode =
    | (() => ConcreteFragment | ConcreteBatch)
    | {
        modern: () => ConcreteFragment | ConcreteBatch,
        classic: () => ConcreteFragmentDefinition | ConcreteOperationDefinition
      };

  declare export function graphql(strings: Array<string>): GraphQLTaggedNode;

  declare export type GeneratedNodeMap = { [key: string]: GraphQLTaggedNode };

  declare export function createFragmentContainer<
    TBase: React$ComponentType<*>
  >(
    Component: TBase,
    fragmentSpec: GraphQLTaggedNode | GeneratedNodeMap
  ): TBase;

  declare export function createRefetchContainer<TBase: React$ComponentType<*>>(
    Component: TBase,
    fragmentSpec: GraphQLTaggedNode | GeneratedNodeMap,
    taggedNode: GraphQLTaggedNode
  ): TBase;

  declare type FragmentVariablesGetter = (
    prevVars: Variables,
    totalCount: number
  ) => Variables;

  declare export type PageInfo = {
    endCursor: ?string,
    hasNextPage: boolean,
    hasPreviousPage: boolean,
    startCursor: ?string
  };

  declare export type ConnectionData = {
    edges?: ?Array<any>,
    pageInfo?: ?PageInfo
  };

  declare export type ConnectionConfig = {
    direction?: "backward" | "forward",
    getConnectionFromProps?: (props: Object) => ?ConnectionData,
    getFragmentVariables?: FragmentVariablesGetter,
    getVariables: (
      props: Object,
      paginationInfo: { count: number, cursor: ?string },
      fragmentVariables: Variables
    ) => Variables,
    query: GraphQLTaggedNode
  };

  declare export function createPaginationContainer<
    TBase: React$ComponentType<*>
  >(
    Component: TBase,
    fragmentSpec: GraphQLTaggedNode | GeneratedNodeMap,
    connectionConfig: ConnectionConfig
  ): TBase;

  declare type Variable = string | null | boolean | number | Variables | void | Array<Variables>;
  declare export type Variables = ?{ [string]: Variable };
  declare export type DataID = string;

  declare type TEnvironment = Environment;
  declare type TFragment = ConcreteFragment;
  declare type TGraphQLTaggedNode = GraphQLTaggedNode;
  declare type TNode = ConcreteSelectableNode;
  declare export type TOperation = ConcreteBatch;
  declare type TPayload = RelayResponsePayload;

  declare export type FragmentMap = CFragmentMap<TFragment>;
  declare export type OperationSelector = COperationSelector<TNode, TOperation>;
  declare export type RelayContext = CRelayContext<TEnvironment>;
  declare export type Selector = CSelector<TNode>;
  declare export type TSnapshot<TRecord> = CSnapshot<TNode, TRecord>;
  declare export type Snapshot = TSnapshot<Record>;
  declare export type ProxySnapshot = TSnapshot<RecordProxy>;
  declare export type UnstableEnvironmentCore = CUnstableEnvironmentCore<
    TEnvironment,
    TFragment,
    TGraphQLTaggedNode,
    TNode,
    TOperation
  >;

  declare export interface IRecordSource<TRecord> {
    get(dataID: DataID): ?TRecord;
  }

  /**
   * A read-only interface for accessing cached graph data.
   */
  declare export interface RecordSource extends IRecordSource<Record> {
    get(dataID: DataID): ?Record;

    getRecordIDs(): Array<DataID>;

    getStatus(dataID: DataID): RecordState;

    has(dataID: DataID): boolean;

    load(
      dataID: DataID,
      callback: (error: ?Error, record: ?Record) => void
    ): void;

    size(): number;
  }

  /**
   * A read/write interface for accessing and updating graph data.
   */
  declare export interface MutableRecordSource extends RecordSource {
    clear(): void;

    delete(dataID: DataID): void;

    remove(dataID: DataID): void;

    set(dataID: DataID, record: Record): void;
  }

  /**
   * An interface for keeping multiple views of data consistent across an
   * application.
   */
  declare export interface Store {
    /**
     * Get a read-only view of the store's internal RecordSource.
     */
    getSource(): RecordSource;

    /**
     * Determine if the selector can be resolved with data in the store (i.e. no
     * fields are missing).
     */
    check(selector: Selector): boolean;

    /**
     * Read the results of a selector from in-memory records in the store.
     */
    lookup(selector: Selector): Snapshot;

    /**
     * Notify subscribers (see `subscribe`) of any data that was published
     * (`publish()`) since the last time `notify` was called.
     */
    notify(): void;

    /**
     * Publish new information (e.g. from the network) to the store, updating its
     * internal record source. Subscribers are not immediately notified - this
     * occurs when `notify()` is called.
     */
    publish(source: RecordSource): void;

    /**
     * Attempts to load all the records necessary to fulfill the selector into the
     * target record source.
     */
    resolve(
      target: MutableRecordSource,
      selector: Selector,
      callback: AsyncLoadCallback
    ): void;

    /**
     * Ensure that all the records necessary to fulfill the given selector are
     * retained in-memory. The records will not be eligible for garbage collection
     * until the returned reference is disposed.
     */
    retain(selector: Selector): Disposable;

    /**
     * Subscribe to changes to the results of a selector. The callback is called
     * when `notify()` is called *and* records have been published that affect the
     * selector results relative to the last `notify()`.
     */
    subscribe(
      snapshot: Snapshot,
      callback: (snapshot: Snapshot) => void
    ): Disposable;
  }

  /**
   * An interface for imperatively getting/setting properties of a `Record`. This interface
   * is designed to allow the appearance of direct Record manipulation while
   * allowing different implementations that may e.g. create a changeset of
   * the modifications.
   */
  declare export interface RecordProxy {
    copyFieldsFrom(source: RecordProxy): void;

    getDataID(): DataID;

    getLinkedRecord(name: string, args?: ?Variables): RecordProxy;

    getLinkedRecords(name: string, args?: ?Variables): ?Array<?RecordProxy>;

    getOrCreateLinkedRecord(
      name: string,
      typeName: string,
      args?: ?Variables
    ): RecordProxy;

    getType(): string;

    getValue(name: string, args?: ?Variables): mixed;

    setLinkedRecord(
      record: RecordProxy,
      name: string,
      args?: ?Variables
    ): RecordProxy;

    setLinkedRecords(
      records: Array<?RecordProxy>,
      name: string,
      args?: ?Variables
    ): RecordProxy;

    setValue(value: mixed, name: string, args?: ?Variables): RecordProxy;
  }

  /**
   * An interface for imperatively getting/setting properties of a `RecordSource`. This interface
   * is designed to allow the appearance of direct RecordSource manipulation while
   * allowing different implementations that may e.g. create a changeset of
   * the modifications.
   */
  declare export interface RecordSourceProxy
    extends IRecordSource<RecordProxy> {
    create(dataID: DataID, typeName: string): RecordProxy;

    delete(dataID: DataID): void;

    get(dataID: DataID): ?RecordProxy;

    getRoot(): RecordProxy;
  }

  /**
   * Extends the RecordSourceProxy interface with methods for accessing the root
   * fields of a Selector.
   */
  declare export interface RecordSourceSelectorProxy
    extends IRecordSource<RecordProxy> {
    create(dataID: DataID, typeName: string): RecordProxy;

    delete(dataID: DataID): void;

    get(dataID: DataID): ?RecordProxy;

    getRoot(): RecordProxy;

    getRootField(fieldName: string): RecordProxy;

    getPluralRootField(fieldName: string): ?Array<?RecordProxy>;

    getResponse(): ?Object;
  }

  declare export interface IRecordReader<TRecord> {
    getDataID(record: TRecord): DataID;

    getType(record: TRecord): string;

    getValue(record: TRecord, name: string, args?: ?Variables): mixed;

    getLinkedRecordID(
      record: TRecord,
      name: string,
      args?: ?Variables
    ): ?DataID;

    getLinkedRecordIDs(
      record: TRecord,
      name: string,
      args?: ?Variables
    ): ?Array<?DataID>;
  }

  /**
   * Settings for how a query response may be cached.
   *
   * - `force`: causes a query to be issued unconditionally, irrespective of the
   *   state of any configured response cache.
   * - `poll`: causes a query to live update by polling at the specified interval
   in milliseconds. (This value will be passed to setTimeout.)
   */
  declare export type CacheConfig = {
    force?: ?boolean,
    poll?: ?number
  };

  /**
   * Represents any resource that must be explicitly disposed of. The most common
   * use-case is as a return value for subscriptions, where calling `dispose()`
   * would cancel the subscription.
   */
  declare export type Disposable = {
    dispose(): void
  };

  /**
   * Arbitrary data e.g. received by a container as props.
   */
  declare export type Props = { [key: string]: mixed };

  /*
   * An individual cached graph object.
   */
  declare export type Record = { [key: string]: mixed };

  /**
   * A collection of records keyed by id.
   */
  declare export type RecordMap<T> = { [dataID: DataID]: ?T };

  /**
   * A selector defines the starting point for a traversal into the graph for the
   * purposes of targeting a subgraph.
   */
  declare export type CSelector<TNode> = {
    dataID: DataID,
    node: TNode,
    variables: Variables
  };

  /**
   * A representation of a selector and its results at a particular point in time.
   */
  declare export type CSnapshot<TNode, TRecord> = CSelector<TNode> & {
    data: ?SelectorData,
    seenRecords: RecordMap<TRecord>
  };

  /**
   * The results of a selector given a store/RecordSource.
   */
  declare export type SelectorData = { [key: string]: mixed };

  /**
   * The results of reading the results of a FragmentMap given some input
   * `Props`.
   */
  declare export type FragmentSpecResults = { [key: string]: mixed };

  /**
   * A utility for resolving and subscribing to the results of a fragment spec
   * (key -> fragment mapping) given some "props" that determine the root ID
   * and variables to use when reading each fragment. When props are changed via
   * `setProps()`, the resolver will update its results and subscriptions
   * accordingly. Internally, the resolver:
   * - Converts the fragment map & props map into a map of `Selector`s.
   * - Removes any resolvers for any props that became null.
   * - Creates resolvers for any props that became non-null.
   * - Updates resolvers with the latest props.
   */
  declare export interface FragmentSpecResolver {
    /**
     * Stop watching for changes to the results of the fragments.
     */
    dispose(): void;

    /**
     * Get the current results.
     */
    resolve(): FragmentSpecResults;

    /**
     * Update the resolver with new inputs. Call `resolve()` to get the updated
     * results.
     */
    setProps(props: Props): void;

    /**
     * Override the variables used to read the results of the fragments. Call
     * `resolve()` to get the updated results.
     */
    setVariables(variables: Variables): void;
  }

  declare export type CFragmentMap<TFragment> = { [key: string]: TFragment };

  /**
   * An operation selector describes a specific instance of a GraphQL operation
   * with variables applied.
   *
   * - `root`: a selector intended for processing server results or retaining
   *   response data in the store.
   * - `fragment`: a selector intended for use in reading or subscribing to
   *   the results of the the operation.
   */
  declare export type COperationSelector<TNode, TOperation> = {
    fragment: CSelector<TNode>,
    node: TOperation,
    root: CSelector<TNode>,
    variables: Variables
  };

  /**
   * The public API of Relay core. Represents an encapsulated environment with its
   * own in-memory cache.
   */
  declare export interface CEnvironment<
    TEnvironment,
    TFragment,
    TGraphQLTaggedNode,
    TNode,
    TOperation,
    TPayload
  > {
    /**
     * Read the results of a selector from in-memory records in the store.
     */
    lookup(selector: CSelector<TNode>): CSnapshot<TNode>;

    /**
     * Subscribe to changes to the results of a selector. The callback is called
     * when data has been committed to the store that would cause the results of
     * the snapshot's selector to change.
     */
    subscribe(
      snapshot: CSnapshot<TNode>,
      callback: (snapshot: CSnapshot<TNode>) => void
    ): Disposable;

    /**
     * Ensure that all the records necessary to fulfill the given selector are
     * retained in-memory. The records will not be eligible for garbage collection
     * until the returned reference is disposed.
     *
     * Note: This is a no-op in the classic core.
     */
    retain(selector: CSelector<TNode>): Disposable;

    /**
     * Send a query to the server with request/response semantics: the query will
     * either complete successfully (calling `onNext` and `onCompleted`) or fail
     * (calling `onError`).
     *
     * Note: Most applications should use `streamQuery` in order to
     * optionally receive updated information over time, should that feature be
     * supported by the network/server. A good rule of thumb is to use this method
     * if you would otherwise immediately dispose the `streamQuery()`
     * after receving the first `onNext` result.
     */
    sendQuery(config: {|
      cacheConfig?: ?CacheConfig,
      onCompleted?: ?() => void,
      onError?: ?(error: Error) => void,
      onNext?: ?(payload: TPayload) => void,
      operation: COperationSelector<TNode, TOperation>
    |}): Disposable;

    /**
     * Send a query to the server with request/subscription semantics: one or more
     * responses may be returned (via `onNext`) over time followed by either
     * the request completing (`onCompleted`) or an error (`onError`).
     *
     * Networks/servers that support subscriptions may choose to hold the
     * subscription open indefinitely such that `onCompleted` is not called.
     */
    streamQuery(config: {|
      cacheConfig?: ?CacheConfig,
      onCompleted?: ?() => void,
      onError?: ?(error: Error) => void,
      onNext?: ?(payload: TPayload) => void,
      operation: COperationSelector<TNode, TOperation>
    |}): Disposable;

    unstable_internal: CUnstableEnvironmentCore<
      TEnvironment,
      TFragment,
      TGraphQLTaggedNode,
      TNode,
      TOperation
    >;
  }

  declare export interface CUnstableEnvironmentCore<
    TEnvironment,
    TFragment,
    TGraphQLTaggedNode,
    TNode,
    TOperation
  > {
    /**
     * Create an instance of a FragmentSpecResolver.
     *
     * TODO: The FragmentSpecResolver *can* be implemented via the other methods
     * defined here, so this could be moved out of core. It's convenient to have
     * separate implementations until the experimental core is in OSS.
     */
    createFragmentSpecResolver: (
      context: CRelayContext<TEnvironment>,
      containerName: string,
      fragments: CFragmentMap<TFragment>,
      props: Props,
      callback: () => void
    ) => FragmentSpecResolver;

    /**
     * Creates an instance of an OperationSelector given an operation definition
     * (see `getOperation`) and the variables to apply. The input variables are
     * filtered to exclude variables that do not matche defined arguments on the
     * operation, and default values are populated for null values.
     */
    createOperationSelector: (
      operation: TOperation,
      variables: Variables
    ) => COperationSelector<TNode, TOperation>;

    /**
     * Given a graphql`...` tagged template, extract a fragment definition usable
     * by this version of Relay core. Throws if the value is not a fragment.
     */
    getFragment: (node: TGraphQLTaggedNode) => TFragment;

    /**
     * Given a graphql`...` tagged template, extract an operation definition
     * usable by this version of Relay core. Throws if the value is not an
     * operation.
     */
    getOperation: (node: TGraphQLTaggedNode) => TOperation;

    /**
     * Determine if two selectors are equal (represent the same selection). Note
     * that this function returns `false` when the two queries/fragments are
     * different objects, even if they select the same fields.
     */
    areEqualSelectors: (a: CSelector<TNode>, b: CSelector<TNode>) => boolean;

    /**
     * Given the result `item` from a parent that fetched `fragment`, creates a
     * selector that can be used to read the results of that fragment for that item.
     *
     * Example:
     *
     * Given two fragments as follows:
     *
     * ```
     * fragment Parent on User {
   *   id
   *   ...Child
   * }
     * fragment Child on User {
   *   name
   * }
     * ```
     *
     * And given some object `parent` that is the results of `Parent` for id "4",
     * the results of `Child` can be accessed by first getting a selector and then
     * using that selector to `lookup()` the results against the environment:
     *
     * ```
     * const childSelector = getSelector(queryVariables, Child, parent);
     * const childData = environment.lookup(childSelector).data;
     * ```
     */
    getSelector: (
      operationVariables: Variables,
      fragment: TFragment,
      prop: mixed
    ) => ?CSelector<TNode>;

    /**
     * Given the result `items` from a parent that fetched `fragment`, creates a
     * selector that can be used to read the results of that fragment on those
     * items. This is similar to `getSelector` but for "plural" fragments that
     * expect an array of results and therefore return an array of selectors.
     */
    getSelectorList: (
      operationVariables: Variables,
      fragment: TFragment,
      props: Array<mixed>
    ) => ?Array<CSelector<TNode>>;

    /**
     * Given a mapping of keys -> results and a mapping of keys -> fragments,
     * extracts the selectors for those fragments from the results.
     *
     * The canonical use-case for this function are Relay Containers, which
     * use this function to convert (props, fragments) into selectors so that they
     * can read the results to pass to the inner component.
     */
    getSelectorsFromObject: (
      operationVariables: Variables,
      fragments: CFragmentMap<TFragment>,
      props: Props
    ) => { [key: string]: ?(CSelector<TNode> | Array<CSelector<TNode>>) };

    /**
     * Given a mapping of keys -> results and a mapping of keys -> fragments,
     * extracts a mapping of keys -> id(s) of the results.
     *
     * Similar to `getSelectorsFromObject()`, this function can be useful in
     * determining the "identity" of the props passed to a component.
     */
    getDataIDsFromObject: (
      fragments: CFragmentMap<TFragment>,
      props: Props
    ) => { [key: string]: ?(DataID | Array<DataID>) };

    /**
     * Given a mapping of keys -> results and a mapping of keys -> fragments,
     * extracts the merged variables that would be in scope for those
     * fragments/results.
     *
     * This can be useful in determing what varaibles were used to fetch the data
     * for a Relay container, for example.
     */
    getVariablesFromObject: (
      operationVariables: Variables,
      fragments: CFragmentMap<TFragment>,
      props: Props
    ) => Variables;
  }

  /**
   * The type of the `relay` property set on React context by the React/Relay
   * integration layer (e.g. QueryRenderer, FragmentContainer, etc).
   */
  declare export type CRelayContext<TEnvironment> = {
    environment: TEnvironment,
    variables: Variables
  };

  /**
   * The public API of Relay core. Represents an encapsulated environment with its
   * own in-memory cache.
   */
  declare export interface Environment
    extends CEnvironment<
      TEnvironment,
      TFragment,
      TGraphQLTaggedNode,
      TNode,
      TOperation,
      TPayload
    > {
    /**
     * Applies an optimistic mutation to the store without committing it to the
     * server. The returned Disposable can be used to revert this change at a
     * later time.
     */
    applyMutation(config: {|
      configs: Array<RelayMutationConfig>,
      operation: ConcreteOperationDefinition,
      optimisticResponse: Object,
      variables: Variables
    |}): Disposable;

    /**
     * Applies an optimistic mutation if provided and commits the mutation to the
     * server. The returned Disposable can be used to bypass the `onCompleted`
     * and `onError` callbacks when the server response is returned.
     */
    sendMutation<ResponseType>(config: {|
      configs: Array<RelayMutationConfig>,
      onCompleted?: ?(response: ResponseType) => void,
      onError?: ?(error: Error) => void,
      operation: ConcreteOperationDefinition,
      optimisticOperation?: ?ConcreteOperationDefinition,
      optimisticResponse?: ?Object,
      variables: Variables,
      uploadables?: UploadableMap
    |}): Disposable;
  }

  declare export type Observer<T> = {
    onCompleted?: ?() => void,
    onError?: ?(error: Error) => void,
    onNext?: ?(data: T) => void
  };

  /**
   * The results of reading data for a fragment. This is similar to a `Selector`,
   * but references the (fragment) node by name rather than by value.
   */
  declare export type FragmentPointer = {
    __id: DataID,
    __fragments: { [fragmentName: string]: Variables }
  };

  /**
   * A callback for resolving a Selector from a source.
   */
  declare export type AsyncLoadCallback = (loadingState: LoadingState) => void;
  declare export type LoadingState = $Exact<{
    status: "aborted" | "complete" | "error" | "missing",
    error?: Error
  }>;

  /**
   * A map of records affected by an update operation.
   */
  declare export type UpdatedRecords = { [dataID: DataID]: boolean };

  /**
   * A function that updates a store (via a proxy) given the results of a "handle"
   * field payload.
   */
  declare export type Handler = {
    update: (store: RecordSourceProxy, fieldPayload: HandleFieldPayload) => void
  };

  /**
   * A payload that is used to initialize or update a "handle" field with
   * information from the server.
   */
  declare export type HandleFieldPayload = $Exact<{
    // The arguments that were fetched.
    args: Variables,
    // The __id of the record containing the source/handle field.
    dataID: DataID,
    // The (storage) key at which the original server data was written.
    fieldKey: string,
    // The name of the handle.
    handle: string,
    // The (storage) key at which the handle's data should be written by the
    // handler.
    handleKey: string
  }>;

  /**
   * A function that receives a proxy over the store and may trigger side-effects
   * (indirectly) by calling `set*` methods on the store or its record proxies.
   */
  declare export type StoreUpdater = (store: RecordSourceProxy) => void;

  /**
   * Similar to StoreUpdater, but accepts a proxy tied to a specific selector in
   * order to easily access the root fields of a query/mutation.
   */
  declare export type SelectorStoreUpdater = (
    store: RecordSourceSelectorProxy
  ) => void;

  declare export type CallValue = ?(
    | boolean
    | number
    | string
    | { [key: string]: CallValue }
    | Array<CallValue>);

  declare export type RangeBehaviorsFunction = (connectionArgs: {
    [argName: string]: CallValue
  }) =>
    | "APPEND"
    | "IGNORE"
    | "PREPEND"
    | "REFETCH"
    | "REMOVE"
    | "NODE_DELETE_HANDLER"
    | "RANGE_ADD_HANDLER"
    | "RANGE_DELETE_HANDLER"
    | "HANDLER_TYPES"
    | "OPTIMISTIC_UPDATE"
    | "SERVER_UPDATE"
    | "POLLER_UPDATE"
    | "UPDATE_TYPES"
    | "RANGE_OPERATIONS";

  declare export type RangeBehaviorsObject = {
    [key: string]: "APPEND" | "IGNORE" | "PREPEND" | "REFETCH" | "REMOVE"
  };

  declare export type RangeBehaviors =
    | RangeBehaviorsFunction
    | RangeBehaviorsObject;

  declare export type RelayConcreteNode = mixed;

  declare export type RelayMutationConfig =
    | {
        type: "FIELDS_CHANGE",
        fieldIDs: { [fieldName: string]: DataID | Array<DataID> }
      }
    | {
        type: "RANGE_ADD",
        parentName?: string,
        parentID?: string,
        connectionInfo?: Array<{
          key: string,
          filters?: Variables,
          rangeBehavior: string
        }>,
        connectionName?: string,
        edgeName: string,
        rangeBehaviors?: RangeBehaviors
      }
    | {
        type: "NODE_DELETE",
        parentName?: string,
        parentID?: string,
        connectionName?: string,
        deletedIDFieldName: string
      }
    | {
        type: "RANGE_DELETE",
        parentName?: string,
        parentID?: string,
        connectionKeys?: Array<{
          key: string,
          filters?: Variables
        }>,
        connectionName?: string,
        deletedIDFieldName: string | Array<string>,
        pathToConnection: Array<string>
      }
    | {
        type: "REQUIRED_CHILDREN",
        children: Array<RelayConcreteNode>
      };

  declare export type MutationConfig<T> = {|
    configs?: Array<RelayMutationConfig>,
    mutation: GraphQLTaggedNode,
    variables: Variables,
    uploadables?: UploadableMap,
    onCompleted?: ?(response: T, errors: ?Array<PayloadError>) => void,
    onError?: ?(error: Error) => void,
    optimisticUpdater?: ?SelectorStoreUpdater,
    optimisticResponse?: Object,
    updater?: ?SelectorStoreUpdater
  |};

  // a.k.a commitRelayModernMutation
  declare export function commitMutation<T>(
    environment: Environment,
    config: MutationConfig<T>
  ): Disposable;

  declare export type ReadyState = {
    error: ?Error,
    props: ?Object,
    retry: ?() => void
  };

  /**
   * Classic environment below here
   */
  declare export class RelayQueryFragment {
    // stub
  }

  declare export class RelayQueryNode {
    // stub
  }

  declare export class RelayQueryRoot {
    // stub
  }

  declare export class RelayStoreData {
    // stub
  }

  declare export type RelayQuerySet = { [queryName: string]: ?RelayQueryRoot };
  declare export type ReadyStateChangeCallback = (
    readyState: ReadyState
  ) => void;
  declare export type Abortable = {
    abort(): void
  };
  declare export type StoreReaderData = Object;
  declare export type StoreReaderOptions = {
    traverseFragmentReferences?: boolean,
    traverseGeneratedFields?: boolean
  };
  declare export type FragmentResolver = {
    dispose(): void,
    resolve(
      fragment: RelayQueryFragment,
      dataIDs: DataID | Array<DataID>
    ): ?(StoreReaderData | Array<?StoreReaderData>)
  };

  declare export interface RelayEnvironmentInterface {
    forceFetch(
      querySet: RelayQuerySet,
      onReadyStateChange: ReadyStateChangeCallback
    ): Abortable;
    getFragmentResolver(
      fragment: RelayQueryFragment,
      onNext: () => void
    ): FragmentResolver;
    getStoreData(): RelayStoreData;
    primeCache(
      querySet: RelayQuerySet,
      onReadyStateChange: ReadyStateChangeCallback
    ): Abortable;
    read(
      node: RelayQueryNode,
      dataID: DataID,
      options?: StoreReaderOptions
    ): ?StoreReaderData;
    readQuery(
      root: RelayQueryRoot,
      options?: StoreReaderOptions
    ): Array<?StoreReaderData>;
  }

  declare export type ClassicEnvironment = RelayEnvironmentInterface;

  declare export class QueryRenderer extends React$Component<{
    cacheConfig?: ?CacheConfig,
    environment: Environment | ClassicEnvironment,
    query: ?GraphQLTaggedNode,
    render: (readyState: ReadyState) => ?React$Element<*>,
    variables: Variables
  }> {}

  // https://github.com/facebook/relay/blob/master/packages/relay-runtime/network/RelayNetworkTypes.js
  /**
   * A cache for saving respones to queries (by id) and variables.
   */
  declare export interface ResponseCache {
    get(id: string, variables: Variables): ?QueryPayload;
    set(id: string, variables: Variables, payload: QueryPayload): void;
  }

  /**
   * An interface for fetching the data for one or more (possibly interdependent)
   * queries.
   */
  declare export interface Network {
    fetch: FetchFunction;
    request: RequestResponseFunction;
    requestStream: RequestStreamFunction;
  }

  declare export type PayloadData = { [key: string]: mixed };

  declare export type PayloadError = {
    message: string,
    locations?: Array<{
      line: number,
      column: number
    }>
  };

  /**
   * The shape of a GraphQL response as dictated by the
   * [spec](http://facebook.github.io/graphql/#sec-Response)
   */
  declare export type QueryPayload = {|
    data?: ?PayloadData,
    errors?: Array<PayloadError>,
    rerunVariables?: Variables
  |};

  /**
   * The shape of data that is returned by the Relay network layer for a given
   * query.
   */
  declare export type RelayResponsePayload = {|
    fieldPayloads?: ?Array<HandleFieldPayload>,
    source: MutableRecordSource,
    errors: ?Array<PayloadError>
  |};

  declare export type PromiseOrValue<T> = Promise<T> | T | Error;

  /**
   * A function that executes a GraphQL operation with request/response semantics,
   * with exactly one raw server response returned
   */
  declare export type FetchFunction = (
    operation: ConcreteBatch,
    variables: Variables,
    cacheConfig: ?CacheConfig,
    uploadables?: UploadableMap
  ) => PromiseOrValue<QueryPayload>;

  /**
   * A function that executes a GraphQL operation with request/subscription
   * semantics, returning one or more raw server responses over time.
   */
  declare export type SubscribeFunction = (
    operation: ConcreteBatch,
    variables: Variables,
    cacheConfig: ?CacheConfig,
    observer: Observer<QueryPayload>
  ) => Disposable;

  /**
   * A function that executes a GraphQL operation with request/subscription
   * semantics, returning one or more responses over time that include the
   * initial result and optional updates e.g. as the results of the operation
   * change.
   */
  declare export type RequestStreamFunction = (
    operation: ConcreteBatch,
    variables: Variables,
    cacheConfig: ?CacheConfig,
    observer: Observer<RelayResponsePayload>
  ) => Disposable;

  /**
   * A function that executes a GraphQL operation with request/response semantics,
   * with exactly one response returned.
   */
  declare export type RequestResponseFunction = (
    operation: ConcreteBatch,
    variables: Variables,
    cacheConfig?: ?CacheConfig,
    uploadables?: UploadableMap
  ) => PromiseOrValue<RelayResponsePayload>;

  declare export type Uploadable = File | Blob;
  declare export type UploadableMap = { [key: string]: Uploadable };

  declare export type RerunParam = {
    param: string,
    import: string,
    max_runs: number
  };

  declare export type RelayProp = {
    environment: Environment
  };

  declare export type RelayPaginationProp = RelayProp & {
    hasMore: () => boolean,
    isLoading: () => boolean,
    loadMore: (
      pageSize: number,
      callback: (error: ?Error) => void,
      options?: RefetchOptions
    ) => ?Disposable,
    refetchConnection: (
      totalCount: number,
      callback: (error: ?Error) => void,
      refetchVariables: ?Variables
    ) => ?Disposable
  };

  declare export type RelayRefetchProp = RelayProp & {
    refetch: (
      refetchVariables:
        | Variables
        | ((fragmentVariables: Variables) => Variables),
      renderVariables: ?Variables,
      callback: ?(error: ?Error) => void,
      options?: RefetchOptions
    ) => Disposable
  };

  declare export type RefetchOptions = {
    force?: boolean,
    rerunParamExperimental?: RerunParam
  };
}

declare module "react-relay/compat" {
  declare module.exports: any;
}

declare module "react-relay/classic" {
  declare module.exports: any;
}

declare module 'react-relay/lib/assertFragmentMap' {
  declare module.exports: any;
}

declare module 'react-relay/lib/buildReactRelayContainer' {
  declare module.exports: any;
}

declare module 'react-relay/lib/buildRQL' {
  declare module.exports: any;
}

declare module 'react-relay/lib/callsFromGraphQL' {
  declare module.exports: any;
}

declare module 'react-relay/lib/callsToGraphQL' {
  declare module.exports: any;
}

declare module 'react-relay/lib/checkRelayQueryData' {
  declare module.exports: any;
}

declare module 'react-relay/lib/ConcreteQuery' {
  declare module.exports: any;
}

declare module 'react-relay/lib/containsRelayQueryRootCall' {
  declare module.exports: any;
}

declare module 'react-relay/lib/createRelayQuery' {
  declare module.exports: any;
}

declare module 'react-relay/lib/dedent' {
  declare module.exports: any;
}

declare module 'react-relay/lib/deepFreeze' {
  declare module.exports: any;
}

declare module 'react-relay/lib/diffRelayQuery' {
  declare module.exports: any;
}

declare module 'react-relay/lib/directivesToGraphQL' {
  declare module.exports: any;
}

declare module 'react-relay/lib/filterExclusiveKeys' {
  declare module.exports: any;
}

declare module 'react-relay/lib/filterRelayQuery' {
  declare module.exports: any;
}

declare module 'react-relay/lib/findRelayQueryLeaves' {
  declare module.exports: any;
}

declare module 'react-relay/lib/flattenRelayQuery' {
  declare module.exports: any;
}

declare module 'react-relay/lib/flattenSplitRelayQueries' {
  declare module.exports: any;
}

declare module 'react-relay/lib/ForceRelayClassicContext' {
  declare module.exports: any;
}

declare module 'react-relay/lib/forEachRootCallArg' {
  declare module.exports: any;
}

declare module 'react-relay/lib/formatStorageKey' {
  declare module.exports: any;
}

declare module 'react-relay/lib/fromGraphQL' {
  declare module.exports: any;
}

declare module 'react-relay/lib/generateClientEdgeID' {
  declare module.exports: any;
}

declare module 'react-relay/lib/generateClientID' {
  declare module.exports: any;
}

declare module 'react-relay/lib/generateConcreteFragmentID' {
  declare module.exports: any;
}

declare module 'react-relay/lib/generateForceIndex' {
  declare module.exports: any;
}

declare module 'react-relay/lib/generateRQLFieldAlias' {
  declare module.exports: any;
}

declare module 'react-relay/lib/getRangeBehavior' {
  declare module.exports: any;
}

declare module 'react-relay/lib/getRelayHandleKey' {
  declare module.exports: any;
}

declare module 'react-relay/lib/getRelayQueries' {
  declare module.exports: any;
}

declare module 'react-relay/lib/GraphQLMutatorConstants' {
  declare module.exports: any;
}

declare module 'react-relay/lib/GraphQLQueryRunner' {
  declare module.exports: any;
}

declare module 'react-relay/lib/GraphQLRange' {
  declare module.exports: any;
}

declare module 'react-relay/lib/GraphQLSegment' {
  declare module.exports: any;
}

declare module 'react-relay/lib/GraphQLStoreChangeEmitter' {
  declare module.exports: any;
}

declare module 'react-relay/lib/GraphQLStoreQueryResolver' {
  declare module.exports: any;
}

declare module 'react-relay/lib/GraphQLStoreRangeUtils' {
  declare module.exports: any;
}

declare module 'react-relay/lib/intersectRelayQuery' {
  declare module.exports: any;
}

declare module 'react-relay/lib/isClassicRelayContext' {
  declare module.exports: any;
}

declare module 'react-relay/lib/isClassicRelayEnvironment' {
  declare module.exports: any;
}

declare module 'react-relay/lib/isCompatibleRelayFragmentType' {
  declare module.exports: any;
}

declare module 'react-relay/lib/isRelayContainer' {
  declare module.exports: any;
}

declare module 'react-relay/lib/isRelayContext' {
  declare module.exports: any;
}

declare module 'react-relay/lib/isRelayEnvironment' {
  declare module.exports: any;
}

declare module 'react-relay/lib/isRelayModernContext' {
  declare module.exports: any;
}

declare module 'react-relay/lib/isRelayVariables' {
  declare module.exports: any;
}

declare module 'react-relay/lib/isScalarAndEqual' {
  declare module.exports: any;
}

declare module 'react-relay/lib/prettyStringify' {
  declare module.exports: any;
}

declare module 'react-relay/lib/printRelayOSSQuery' {
  declare module.exports: any;
}

declare module 'react-relay/lib/printRelayQuery' {
  declare module.exports: any;
}

declare module 'react-relay/lib/QueryBuilder' {
  declare module.exports: any;
}

declare module 'react-relay/lib/rangeOperationToMetadataKey' {
  declare module.exports: any;
}

declare module 'react-relay/lib/ReactRelayClassicExports' {
  declare module.exports: any;
}

declare module 'react-relay/lib/ReactRelayCompatContainerBuilder' {
  declare module.exports: any;
}

declare module 'react-relay/lib/ReactRelayCompatPublic' {
  declare module.exports: any;
}

declare module 'react-relay/lib/ReactRelayContainerProfiler' {
  declare module.exports: any;
}

declare module 'react-relay/lib/ReactRelayFragmentContainer-flowtest' {
  declare module.exports: any;
}

declare module 'react-relay/lib/ReactRelayFragmentContainer' {
  declare module.exports: any;
}

declare module 'react-relay/lib/ReactRelayFragmentMockRenderer' {
  declare module.exports: any;
}

declare module 'react-relay/lib/ReactRelayPaginationContainer-flowtest' {
  declare module.exports: any;
}

declare module 'react-relay/lib/ReactRelayPaginationContainer' {
  declare module.exports: any;
}

declare module 'react-relay/lib/ReactRelayPropTypes' {
  declare module.exports: any;
}

declare module 'react-relay/lib/ReactRelayPublic' {
  declare module.exports: any;
}

declare module 'react-relay/lib/ReactRelayQueryRenderer' {
  declare module.exports: any;
}

declare module 'react-relay/lib/ReactRelayRefetchContainer-flowtest' {
  declare module.exports: any;
}

declare module 'react-relay/lib/ReactRelayRefetchContainer' {
  declare module.exports: any;
}

declare module 'react-relay/lib/ReactRelayTypes' {
  declare module.exports: any;
}

declare module 'react-relay/lib/readRelayQueryData' {
  declare module.exports: any;
}

declare module 'react-relay/lib/recycleNodesInto' {
  declare module.exports: any;
}

declare module 'react-relay/lib/RelayCacheProcessor' {
  declare module.exports: any;
}

declare module 'react-relay/lib/RelayChangeTracker' {
  declare module.exports: any;
}

declare module 'react-relay/lib/RelayClassicCore' {
  declare module.exports: any;
}

declare module 'react-relay/lib/RelayClassicRecordState' {
  declare module.exports: any;
}

declare module 'react-relay/lib/RelayCombinedEnvironmentTypes' {
  declare module.exports: any;
}

declare module 'react-relay/lib/RelayCompatContainer' {
  declare module.exports: any;
}

declare module 'react-relay/lib/RelayCompatEnvironment' {
  declare module.exports: any;
}

declare module 'react-relay/lib/RelayCompatMutations' {
  declare module.exports: any;
}

declare module 'react-relay/lib/RelayCompatPaginationContainer' {
  declare module.exports: any;
}

declare module 'react-relay/lib/RelayCompatRefetchContainer' {
  declare module.exports: any;
}

declare module 'react-relay/lib/RelayCompatTypes' {
  declare module.exports: any;
}

declare module 'react-relay/lib/RelayConcreteNode' {
  declare module.exports: any;
}

declare module 'react-relay/lib/RelayConnectionInterface' {
  declare module.exports: any;
}

declare module 'react-relay/lib/RelayContainer' {
  declare module.exports: any;
}

declare module 'react-relay/lib/RelayContainerComparators' {
  declare module.exports: any;
}

declare module 'react-relay/lib/RelayContainerProxy' {
  declare module.exports: any;
}

declare module 'react-relay/lib/RelayContainerUtils' {
  declare module.exports: any;
}

declare module 'react-relay/lib/RelayDefaultHandleKey' {
  declare module.exports: any;
}

declare module 'react-relay/lib/RelayDefaultNetworkLayer' {
  declare module.exports: any;
}

declare module 'react-relay/lib/RelayEnvironment' {
  declare module.exports: any;
}

declare module 'react-relay/lib/RelayEnvironmentSerializer' {
  declare module.exports: any;
}

declare module 'react-relay/lib/RelayEnvironmentTypes' {
  declare module.exports: any;
}

declare module 'react-relay/lib/RelayError' {
  declare module.exports: any;
}

declare module 'react-relay/lib/RelayEventStatus' {
  declare module.exports: any;
}

declare module 'react-relay/lib/RelayFetchMode' {
  declare module.exports: any;
}

declare module 'react-relay/lib/RelayFragmentPointer' {
  declare module.exports: any;
}

declare module 'react-relay/lib/RelayFragmentReference' {
  declare module.exports: any;
}

declare module 'react-relay/lib/RelayFragmentSpecResolver' {
  declare module.exports: any;
}

declare module 'react-relay/lib/RelayGarbageCollection' {
  declare module.exports: any;
}

declare module 'react-relay/lib/RelayGarbageCollector' {
  declare module.exports: any;
}

declare module 'react-relay/lib/RelayGraphQLMutation' {
  declare module.exports: any;
}

declare module 'react-relay/lib/RelayGraphQLTag' {
  declare module.exports: any;
}

declare module 'react-relay/lib/RelayInternals' {
  declare module.exports: any;
}

declare module 'react-relay/lib/RelayInternalTypes' {
  declare module.exports: any;
}

declare module 'react-relay/lib/RelayMetaRoute' {
  declare module.exports: any;
}

declare module 'react-relay/lib/RelayMetricsRecorder' {
  declare module.exports: any;
}

declare module 'react-relay/lib/RelayMockRenderer' {
  declare module.exports: any;
}

declare module 'react-relay/lib/RelayMutation' {
  declare module.exports: any;
}

declare module 'react-relay/lib/RelayMutationDebugPrinter' {
  declare module.exports: any;
}

declare module 'react-relay/lib/RelayMutationQuery' {
  declare module.exports: any;
}

declare module 'react-relay/lib/RelayMutationQueue' {
  declare module.exports: any;
}

declare module 'react-relay/lib/RelayMutationRequest' {
  declare module.exports: any;
}

declare module 'react-relay/lib/RelayMutationTracker' {
  declare module.exports: any;
}

declare module 'react-relay/lib/RelayMutationTransaction' {
  declare module.exports: any;
}

declare module 'react-relay/lib/RelayMutationTransactionStatus' {
  declare module.exports: any;
}

declare module 'react-relay/lib/RelayMutationType' {
  declare module.exports: any;
}

declare module 'react-relay/lib/RelayNetworkDebug' {
  declare module.exports: any;
}

declare module 'react-relay/lib/RelayNetworkLayer' {
  declare module.exports: any;
}

declare module 'react-relay/lib/RelayNodeInterface' {
  declare module.exports: any;
}

declare module 'react-relay/lib/RelayOperationSelector' {
  declare module.exports: any;
}

declare module 'react-relay/lib/RelayOptimisticMutationUtils' {
  declare module.exports: any;
}

declare module 'react-relay/lib/RelayOSSConnectionInterface' {
  declare module.exports: any;
}

declare module 'react-relay/lib/RelayPendingQueryTracker' {
  declare module.exports: any;
}

declare module 'react-relay/lib/RelayProfiler' {
  declare module.exports: any;
}

declare module 'react-relay/lib/RelayPropTypes' {
  declare module.exports: any;
}

declare module 'react-relay/lib/RelayPublic' {
  declare module.exports: any;
}

declare module 'react-relay/lib/RelayQL_GENERATED' {
  declare module.exports: any;
}

declare module 'react-relay/lib/RelayQL' {
  declare module.exports: any;
}

declare module 'react-relay/lib/RelayQuery' {
  declare module.exports: any;
}

declare module 'react-relay/lib/RelayQueryCaching' {
  declare module.exports: any;
}

declare module 'react-relay/lib/RelayQueryConfig' {
  declare module.exports: any;
}

declare module 'react-relay/lib/RelayQueryPath' {
  declare module.exports: any;
}

declare module 'react-relay/lib/RelayQueryRequest' {
  declare module.exports: any;
}

declare module 'react-relay/lib/RelayQueryResultObservable' {
  declare module.exports: any;
}

declare module 'react-relay/lib/RelayQueryTracker' {
  declare module.exports: any;
}

declare module 'react-relay/lib/RelayQueryTransform' {
  declare module.exports: any;
}

declare module 'react-relay/lib/RelayQueryVisitor' {
  declare module.exports: any;
}

declare module 'react-relay/lib/RelayQueryWriter' {
  declare module.exports: any;
}

declare module 'react-relay/lib/RelayReadyState' {
  declare module.exports: any;
}

declare module 'react-relay/lib/RelayReadyStateRenderer' {
  declare module.exports: any;
}

declare module 'react-relay/lib/RelayRecord' {
  declare module.exports: any;
}

declare module 'react-relay/lib/RelayRecordStatusMap' {
  declare module.exports: any;
}

declare module 'react-relay/lib/RelayRecordStore' {
  declare module.exports: any;
}

declare module 'react-relay/lib/RelayRecordWriter' {
  declare module.exports: any;
}

declare module 'react-relay/lib/RelayRefQueryDescriptor' {
  declare module.exports: any;
}

declare module 'react-relay/lib/RelayRenderer' {
  declare module.exports: any;
}

declare module 'react-relay/lib/RelayRootContainer' {
  declare module.exports: any;
}

declare module 'react-relay/lib/RelayRoute' {
  declare module.exports: any;
}

declare module 'react-relay/lib/RelayRouteFragment' {
  declare module.exports: any;
}

declare module 'react-relay/lib/RelaySelector' {
  declare module.exports: any;
}

declare module 'react-relay/lib/RelayShallowMock' {
  declare module.exports: any;
}

declare module 'react-relay/lib/RelayStore' {
  declare module.exports: any;
}

declare module 'react-relay/lib/RelayStoreConstants' {
  declare module.exports: any;
}

declare module 'react-relay/lib/RelayStoreData' {
  declare module.exports: any;
}

declare module 'react-relay/lib/RelayTaskQueue' {
  declare module.exports: any;
}

declare module 'react-relay/lib/RelayTypes' {
  declare module.exports: any;
}

declare module 'react-relay/lib/relayUnstableBatchedUpdates' {
  declare module.exports: any;
}

declare module 'react-relay/lib/relayUnstableBatchedUpdates.native' {
  declare module.exports: any;
}

declare module 'react-relay/lib/RelayVariable' {
  declare module.exports: any;
}

declare module 'react-relay/lib/RelayVariables' {
  declare module.exports: any;
}

declare module 'react-relay/lib/restoreRelayCacheData' {
  declare module.exports: any;
}

declare module 'react-relay/lib/serializeRelayQueryCall' {
  declare module.exports: any;
}

declare module 'react-relay/lib/simpleClone' {
  declare module.exports: any;
}

declare module 'react-relay/lib/splitDeferredRelayQueries' {
  declare module.exports: any;
}

declare module 'react-relay/lib/stableJSONStringify' {
  declare module.exports: any;
}

declare module 'react-relay/lib/stableStringify' {
  declare module.exports: any;
}

declare module 'react-relay/lib/testEditDistance' {
  declare module.exports: any;
}

declare module 'react-relay/lib/throwFailedPromise' {
  declare module.exports: any;
}

declare module 'react-relay/lib/toGraphQL' {
  declare module.exports: any;
}

declare module 'react-relay/lib/transformRelayQueryPayload' {
  declare module.exports: any;
}

declare module 'react-relay/lib/validateMutationConfig' {
  declare module.exports: any;
}

declare module 'react-relay/lib/validateRelayReadQuery' {
  declare module.exports: any;
}

declare module 'react-relay/lib/writeRelayQueryPayload' {
  declare module.exports: any;
}

declare module 'react-relay/lib/writeRelayUpdatePayload' {
  declare module.exports: any;
}
