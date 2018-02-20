// additional functions
// abstract effects

let obj1 = global.__abstract ? __abstract({}, '({foo: {valueOf() { return 42; }}})') : {foo: {valueOf() { return 42; }}};
let obj2 = global.__abstract ? __abstract({}, '({foo: {bar: {valueOf() { return 42; }}}})') : {foo: {bar: {valueOf() { return 42; }}}};

if (global.__makePartial) {
  __makePartial(obj1);
  __makePartial(obj2);
}
if (global.__makeSimple) {
  __makeSimple(obj1);
  __makeSimple(obj2);
}

function additional1() {
  return 42 < obj1.foo;
}

function additional2() {
  return 42 < obj2.foo.bar;
}

inspect = function() {
  let ret1 = additional1();
  let ret2 = additional2();
  return ret1 + ret2;
}