// expected Warning: PP1007

var AGlobalObject = {};
var AGlobalValue = 5;
var BGlobalObject = { bar: 5 };
var BGlobalValue = 10;

function hello() {
  return " hello ";
}

function world() {
  return " world ";
}

function fib(x) {
  return x <= 1 ? x : fib(x - 1) + fib(x - 2);
}

function additional1() {
  var x = 42;
  AGlobalObject.foo = AGlobalValue * x;
  if (x % 2 === 0) AGlobalValue = JSON.stringify(AGlobalObject);
}

function additional2() {
  let x = BGlobalObject.bar;
  delete BGlobalObject.bar;
  BGlobalObject.baz = BGlobalValue % x;
  let tmp = hello() + world();
  let bigfib = fib(10);
  BGlobalValue = tmp + bigfib;
}

if (global.__optimize) {
  __optimize(additional1);
  __optimize(additional2);
}

inspect = function() {
  let originalA = AGlobalObject;
  let originalA2 = AGlobalValue;
  let originalB = BGlobalObject.bar;
  let originalB2 = BGlobalValue;
  additional1();
  additional2();
  return (
    "" +
    JSON.stringify(originalA) +
    JSON.stringify(AGlobalObject) +
    originalA2 +
    AGlobalValue +
    originalB +
    JSON.stringify(BGlobalObject) +
    originalB2 +
    BGlobalValue
  );
};
