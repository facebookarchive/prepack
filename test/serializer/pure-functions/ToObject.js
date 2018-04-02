// abstract effects

var obj = global.__abstract && global.__makePartial && global.__makeSimple ? __makePartial(__makeSimple(__abstract({}, "({foo:1})"))) : {foo:1};

function additional1() {
  return Object.assign(obj.foo);
}

function additional2() {
  return Object.prototype.valueOf.call(obj.foo);
}

if (global.__optimize) {
  __optimize(additional1);
  __optimize(additional2);
}

inspect = function() {
  var foo1 = typeof additional1();
  var foo2 = typeof additional2();
  return JSON.stringify({ foo1, foo2 });
}
