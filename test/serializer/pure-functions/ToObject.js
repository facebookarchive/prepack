var obj =
  global.__abstract && global.__makePartial && global.__makeSimple
    ? __makePartial(__makeSimple(__abstract({}, "({foo:1})")))
    : { foo: 1 };
var num = global.__abstract ? __abstract("number", "(1)") : 1;
var val = global.__abstract ? __abstract(undefined, "(true)") : true;
var str = global.__abstract ? __abstract("string", "('123')") : "123";

function f1() {
  return Object.assign(obj.foo);
}

function f2() {
  return Object.prototype.valueOf.call(obj.foo);
}

function f3() {
  return Object.getPrototypeOf(num);
}

function f4() {
  return Object.getPrototypeOf(val);
}

function f5() {
  return str.valueOf;
}

if (global.__optimize) {
  __optimize(f1);
  __optimize(f2);
  __optimize(f3);
  __optimize(f4);
  __optimize(f5);
}

inspect = function() {
  return JSON.stringify({ f1: f1().name, f2: f2().name, f3: f3().name, f4: f4().name, f5: f5().name });
};
