// additional functions
// abstract effects

let obj1 = global.__abstract ? __abstract('object', '({foo: {valueOf() { return 42; }}})') : {foo: {valueOf() { return 42; }}};
let obj2 = global.__abstract ? __abstract('object', '({foo: {bar: {valueOf() { return 42; }}}})') : {foo: {bar: {valueOf() { return 42; }}}};

function additional1() {
  return 42 < obj1.foo;
}

function additional2() {
  return obj2.foo.bar > 42;
}

inspect = function() {
  let ret1 = additional1();
  let ret2 = additional2();
  return JSON.stringify({ ret1, ret2 });
}
