// Copies of function:3
(function() {
function Foo() {
  return 123;
}

function Bar() {
  let result = Foo();
  return result;
}

if (global.__registerAdditionalFunctionToPrepack) __registerAdditionalFunctionToPrepack(Bar);
global.Bar = Bar;

global.inspect = function () {
  return global.Bar();
}
}());
