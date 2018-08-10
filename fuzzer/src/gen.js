/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

const t = require("@babel/types");
const Immutable = require("immutable");
const { gen } = require("testcheck");

const ScopeRecord = Immutable.Record({
  variables: Immutable.List(),
  functions: Immutable.List(),
});

const StateRecord = Immutable.Record({
  declarations: Immutable.List(),
  scopes: Immutable.List([ScopeRecord()]),
  nextVariableId: 1,
  nextFunctionId: 1,
  nextArgumentId: 1,
});

const genString = gen.array(gen.asciiChar, { maxSize: 20 }).then(chars => chars.join(""));

const genValueLiteral = gen.oneOfWeighted([
  // null / undefined
  [1, gen.oneOf([gen.return(t.nullLiteral()), gen.return(t.identifier("undefined"))])],

  // number
  [1, gen.number.then(n => gen.return(t.numericLiteral(n)))],

  // string
  [1, genString.then(s => gen.return(t.stringLiteral(s)))],

  // boolean
  [7, gen.oneOf([gen.return(t.booleanLiteral(true)), gen.return(t.booleanLiteral(false))])],
]);

function createGenComputation() {
  const _getStateSymbol = Symbol("getState");

  function* getState() {
    return yield _getStateSymbol;
  }

  function* putState(nextState) {
    yield nextState;
  }

  function* replaceState(f) {
    yield f(yield _getStateSymbol);
  }

  function* newVariable() {
    let state = yield* getState();
    const name = `x${state.nextVariableId}`;
    state = state.update("nextVariableId", x => x + 1).updateIn(["scopes", -1, "variables"], vs => vs.push({ name }));
    yield* putState(state);
    return name;
  }

  function* newFunction(arity) {
    let state = yield* getState();
    const name = `f${state.nextFunctionId}`;
    state = state
      .update("nextFunctionId", x => x + 1)
      .updateIn(["scopes", -1, "functions"], fs => fs.push({ name, arity }));
    yield* putState(state);
    return name;
  }

  function* newArgument() {
    let state = yield* getState();
    const name = `a${state.nextArgumentId}`;
    state = state.update("nextArgumentId", x => x + 1).updateIn(["scopes", -1, "variables"], vs => vs.push({ name }));
    yield* putState(state);
    return name;
  }

  const genScalarComputation = gen.oneOfWeighted([
    [
      1,
      genValueLiteral.then(expression => {
        const result = {
          statements: Immutable.List(),
          expression,
        };
        return {
          args: 0,
          *computation() {
            return result;
          },
        };
      }),
    ],

    // Reuse variable
    [
      2,
      gen.posInt.then(n => ({
        args: 0,
        *computation() {
          const state = yield* getState();
          const variables = Immutable.List().concat(...state.scopes.map(scope => scope.variables));
          if (variables.isEmpty()) {
            // If we have no variables to reuse then return something else.
            return {
              statements: Immutable.List(),
              expression: t.numericLiteral(n),
            };
          } else {
            const variable = variables.get(n % variables.size);
            return {
              statements: Immutable.List(),
              expression: t.identifier(variable.name),
            };
          }
        },
      })),
    ],

    // Argument
    [
      4,
      gen.return({
        args: 1,
        *computation() {
          const expression = t.identifier(yield* newArgument());
          return {
            statements: Immutable.List(),
            expression,
          };
        },
      }),
    ],

    // // Intentional failure. Uncomment this to test if everything is working.
    // [
    //   1,
    //   gen.return({
    //     args: 0,
    //     *computation() {
    //       const expression = t.conditionalExpression(
    //         t.memberExpression(
    //           t.identifier('global'),
    //           t.identifier('__optimize')
    //         ),
    //         t.booleanLiteral(true),
    //         t.booleanLiteral(false)
    //       );
    //       return {statements: Immutable.List(), expression};
    //     },
    //   }),
    // ],
  ]);

  function* conditional(computation) {
    yield* replaceState(state => state.update("scopes", scopes => scopes.push(ScopeRecord())));
    const result = yield* computation();
    yield* replaceState(state => state.update("scopes", scope => scope.pop()));
    return result;
  }

  const genNestedComputation = genComputation =>
    gen.oneOfWeighted([
      // condition ? consequent : alternate
      [
        5,
        gen([genComputation, genComputation, genComputation]).then(([c, tr, fa]) => ({
          args: c.args + tr.args + fa.args,
          *computation() {
            const condition = yield* c.computation();
            let statements = condition.statements;

            // Conditionally generate consequent and alternate.
            const consequent = yield* conditional(tr.computation);
            const alternate = yield* conditional(fa.computation);

            // If our consequent and/or alternate have statements then we need
            // to hoist these statements to an if-statement.
            const conditionReuse =
              (!consequent.statements.isEmpty() || !alternate.statements.isEmpty()) &&
              t.identifier(yield* newVariable());

            if (conditionReuse) {
              statements = statements.push(
                t.variableDeclaration("var", [t.variableDeclarator(conditionReuse, condition.expression)])
              );
              if (consequent.statements.isEmpty() && !alternate.statements.isEmpty()) {
                statements = statements.push(
                  t.ifStatement(
                    t.unaryExpression("!", conditionReuse),
                    t.blockStatement(alternate.statements.toArray())
                  )
                );
              } else {
                statements = statements.push(
                  t.ifStatement(
                    conditionReuse,
                    t.blockStatement(consequent.statements.toArray()),
                    alternate.statements.size === 0 ? undefined : t.blockStatement(alternate.statements.toArray())
                  )
                );
              }
            }
            return {
              statements,
              expression: t.conditionalExpression(
                conditionReuse || condition.expression,
                consequent.expression,
                alternate.expression
              ),
            };
          },
        })),
      ],

      // if (condition) { consequent } else { alternate }
      [
        10,
        gen([
          genComputation,
          genComputation,
          genComputation,
          gen.oneOfWeighted([[1, gen.return(true)], [5, gen.return(false)]]),
          gen.oneOfWeighted([[1, gen.return(true)], [5, gen.return(false)]]),
        ]).then(([c, tr, fa, returnConsequent, returnAlternate]) => ({
          args: c.args + tr.args + fa.args,
          *computation() {
            const condition = yield* c.computation();
            const consequent = yield* conditional(tr.computation);
            const alternate = yield* conditional(fa.computation);
            const variable = yield* newVariable();

            let { statements } = condition;
            let consequentStatements = consequent.statements;
            let alternateStatements = alternate.statements;

            statements = statements.push(t.variableDeclaration("var", [t.variableDeclarator(t.identifier(variable))]));

            if (returnConsequent) {
              consequentStatements = consequentStatements.push(t.returnStatement(consequent.expression));
            } else {
              consequentStatements = consequentStatements.push(
                t.expressionStatement(t.assignmentExpression("=", t.identifier(variable), consequent.expression))
              );
            }
            if (returnAlternate) {
              alternateStatements = alternateStatements.push(t.returnStatement(alternate.expression));
            } else {
              alternateStatements = alternateStatements.push(
                t.expressionStatement(t.assignmentExpression("=", t.identifier(variable), alternate.expression))
              );
            }
            statements = statements.push(
              t.ifStatement(
                condition.expression,
                t.blockStatement(consequentStatements.toArray()),
                t.blockStatement(alternateStatements.toArray())
              )
            );

            return {
              statements,
              expression: t.identifier(variable),
            };
          },
        })),
      ],

      // var id = init;
      [
        20,
        genComputation.then(({ args, computation }) => ({
          args,
          *computation() {
            const { statements, expression } = yield* computation();
            const variable = yield* newVariable();
            return {
              statements: statements.push(
                t.variableDeclaration("var", [t.variableDeclarator(t.identifier(variable), expression)])
              ),
              expression: t.identifier(variable),
            };
          },
        })),
      ],

      // function f(...args) { body }
      [
        15,
        genComputation
          .then(({ args, computation }) => ({
            computation,
            argComputations: Array(args).fill(genComputation),
          }))
          .then(({ computation, argComputations }) => ({
            args: argComputations.reduce((acc, c) => acc + c.args, 0),
            *computation() {
              // Generate our computation in a new state with new scopes. Then
              // restore the old state.
              const prevState = yield* getState();
              const prevNextVariableId = prevState.get("nextVariableId");
              const prevNextArgumentId = prevState.get("nextArgumentId");
              const prevScopes = prevState.get("scopes");
              yield* replaceState(state =>
                state
                  .set("nextVariableId", 1)
                  .set("nextArgumentId", 1)
                  .set("scopes", Immutable.List([ScopeRecord()]))
              );
              const fn = yield* computation();
              yield* replaceState(state =>
                state
                  .set("nextVariableId", prevNextVariableId)
                  .set("nextArgumentId", prevNextArgumentId)
                  .set("scopes", prevScopes)
              );

              // Create the function declaration.
              const functionStatements = fn.statements.push(t.returnStatement(fn.expression));
              const functionName = yield* newFunction(argComputations.length);
              const functionDeclaration = t.functionDeclaration(
                t.identifier(functionName),
                argComputations.map((_, i) => t.identifier(`a${i + 1}`)),
                t.blockStatement(functionStatements.toArray())
              );
              yield* replaceState(state =>
                state.update("declarations", declarations => declarations.push(functionDeclaration))
              );

              // Compute the arguments.
              let statements = Immutable.List();
              const args = [];
              for (const { computation: argComputation } of argComputations) {
                const arg = yield* argComputation();
                statements = statements.concat(arg.statements);
                args.push(arg.expression);
              }

              return {
                statements,
                expression: t.callExpression(t.identifier(functionName), args),
              };
            },
          })),
      ],

      // ignored; computation
      [
        1,
        gen([genComputation, genComputation]).then(
          ([{ args: ignoredArgs, computation: ignoredComputation }, { args, computation }]) => ({
            args: ignoredArgs + args,
            *computation() {
              const { statements: ignoredStatements, expression: ignoredExpression } = yield* ignoredComputation();
              const { statements, expression } = yield* computation();
              return {
                statements: ignoredStatements.push(t.expressionStatement(ignoredExpression)).concat(statements),
                expression,
              };
            },
          })
        ),
      ],
    ]);

  // Wrap for at least one level of nesting.
  const genComputation = genNestedComputation(gen.nested(genNestedComputation, genScalarComputation));

  // Runer for the state monad we use for computations. We want to use some
  // state in our computations. This is why we use a monad.
  return genComputation.then(({ args, computation }) => {
    const generator = computation();
    let state = StateRecord();
    let step = generator.next();
    while (!step.done) {
      if (step.value === _getStateSymbol) {
        step = generator.next(state);
      } else {
        state = step.value;
        step = generator.next();
      }
    }
    return gen.return({
      args,
      computation: step.value,
      declarations: state.declarations,
    });
  });
}

const genProgramStatements = createGenComputation()
  .then(({ args, computation, declarations }) => ({
    args: gen.array(genValueLiteral, { size: args }),
    computation: gen.return(computation),
    declarations: gen.return(declarations),
  }))
  .then(({ args, computation: { statements: mainStatements, expression: mainExpression }, declarations }) => {
    mainStatements = mainStatements.push(t.returnStatement(mainExpression));
    const statements = [];
    statements.push(t.expressionStatement(t.stringLiteral("use strict")));
    declarations.forEach(declaration => {
      statements.push(declaration);
    });
    statements.push(
      t.functionDeclaration(
        t.identifier("main"),
        args.map((arg, i) => t.identifier(`a${i + 1}`)),
        t.blockStatement(mainStatements.toArray())
      )
    );
    statements.push(
      t.ifStatement(
        t.memberExpression(t.identifier("global"), t.identifier("__optimize")),
        t.expressionStatement(t.callExpression(t.identifier("__optimize"), [t.identifier("main")]))
      )
    );
    statements.push(
      t.expressionStatement(
        t.assignmentExpression(
          "=",
          t.memberExpression(t.identifier("module"), t.identifier("exports")),
          t.functionExpression(
            t.identifier("inspect"),
            [],
            t.blockStatement([t.returnStatement(t.callExpression(t.identifier("main"), args))])
          )
        )
      )
    );
    return gen.return(statements);
  });

const genProgram = genProgramStatements.then(statements => gen.return(t.program(statements)));

const genPrgramWrappedInIife = genProgramStatements.then(statements =>
  gen.return(
    t.program([
      t.expressionStatement(t.callExpression(t.functionExpression(null, [], t.blockStatement(statements)), [])),
    ])
  )
);

module.exports = {
  genProgram,
  genPrgramWrappedInIife,
};
