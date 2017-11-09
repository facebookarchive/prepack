(function() {
let Foo = { x: 5 };

function Bar() {
  Foo.x += 2;
  let result = Foo.x;
  return result;
}

if (global.__registerAdditionalFunctionToPrepack) __registerAdditionalFunctionToPrepack(Bar);
global.Bar = Bar;

global.inspect = function () {
  return global.Bar();
}
}());
