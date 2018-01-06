(function() {
function Bar() {
  return 123;
}

function Foo() {
  return Bar();
}

if (global.__registerAdditionalFunctionToPrepack) __registerAdditionalFunctionToPrepack(Foo);

global.Foo = Foo;

inspect = function() {
	return Foo();
}
}());
