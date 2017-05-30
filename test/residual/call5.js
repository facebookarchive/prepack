let b = global.__abstract ? __abstract("boolean", "true") : true;

function foo() {
  return 1;
}

function bar() {
  throw 2;
}

let fooBar;
if (b) {
  fooBar = foo;
} else {
  fooBar = bar;
}

__result = fooBar();
