(function() {
function Foo() {
  return 123;
}

function Bar() {
  return Foo();
}

if (global.__registerAdditionalFunctionToPrepack) __registerAdditionalFunctionToPrepack(Bar);
global.Bar = Bar;

global.inspect = function () {
  return global.Bar();
}
}());
