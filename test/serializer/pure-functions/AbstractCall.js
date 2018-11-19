let forEach = global.__abstract
  ? __abstract("function", '(function(callback) { callback("a", 0); callback("b", 1); })')
  : function(callback) {
      callback("a", 0);
      callback("b", 1);
    };
let set = global.__abstract
  ? __abstract("function", "(function(obj, name, value) { obj[name] = value; })")
  : function(obj, name, value) {
      obj[name] = value;
    };

function additional1() {
  var count = 0;
  forEach(function() {
    count++;
  });
  foo = function() {
    return count;
  };
}

function additional2() {
  let obj = { x: 0, y: 1 };
  set(obj, "x", 2);
  set(obj, "y", obj.x);
  bar = function() {
    return obj;
  };
}

if (global.__optimize) {
  __optimize(additional1);
  __optimize(additional2);
}

inspect = function() {
  additional1();
  additional2();
  let ret1 = global.foo();
  let ret2 = global.bar();
  return JSON.stringify({ ret1, ret2 });
};
