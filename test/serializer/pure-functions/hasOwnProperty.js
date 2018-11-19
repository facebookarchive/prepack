var obj = global.__abstract && global.__makePartial ? __makePartial(__abstract({}, "({foo:1})")) : { foo: 1 };
if (global.__makeSimple) __makeSimple(obj);

function additional1() {
  var foo = obj.foo;
  return Object.prototype.hasOwnProperty.call(foo, "bar");
}

function additional2() {
  var foo = obj.foo;
  var dontHavocThis = {
    bar: 2,
    toString: function() {
      return "bar";
    },
  };
  Object.prototype.hasOwnProperty.call(foo, dontHavocThis);
  if (global.__isAbstract && __isAbstract(dontHavocThis.bar)) {
    return "This should not be abstract.";
  }
  return dontHavocThis.bar;
}

if (global.__optimize) {
  __optimize(additional1);
  __optimize(additional2);
}

inspect = function() {
  var obj1 = additional1();
  var obj2 = additional2();
  return JSON.stringify({ obj1, obj2 });
};
