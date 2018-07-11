let x = global.__abstract ? global.__abstract("boolean", "true") : true;
let y = global.__abstract ? global.__abstract("boolean", "false") : false;
let z = global.__abstract ? global.__abstract("boolean", "(false)") : false;

function foo1() {
  if (x) {
    if (y) throw new Error("x is true");
    else return 1;
  } else {
    throw new Error("x is false");
  }
}

function foo2() {
  if (x) {
    if (!y) return 1;
    else throw new Error("x is true");
  } else {
    throw new Error("x is false");
  }
}

function foo3() {
  if (!x) {
    throw new Error("x is false");
  } else {
    if (z) throw new Error("x is true");
    return 2;
  }
}

function foo4() {
  if (!x) {
    throw new Error("x is false");
  } else {
    if (!z) return 2;
    throw new Error("x is true");
  }
}

var z1;
var z2;
var z3;
var z4;

try {
  z1 = foo1();
} catch (e) {}
try {
  z2 = foo2();
} catch (e) {}
try {
  z3 = foo3();
} catch (e) {}
try {
  z4 = foo4();
} catch (e) {}

inspect = function() {
  return [z1, z2, z3, z4].join(" ");
};
