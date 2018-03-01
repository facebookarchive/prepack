function additional1() {
  return {foo: function foo() {
    return 123;
  }};
}

if (this.__registerAdditionalFunctionToPrepack) {
  __registerAdditionalFunctionToPrepack(additional1);
}

inspect = function() {
  let x = additional1();

  return x.foo();
}