// add at runtime:global.__obj1 = { a: 1 }; global.__obj2 = { a: 2 };

let obj1 = global.__abstract ? __abstract({}, "global.__obj1") : { a: 1 };
let obj2 = global.__abstract ? __abstract({}, "global.__obj2") : { a: 2 };

if (global.__makePartial) {
  __makePartial(obj1);
  __makePartial(obj2);
}
if (global.__makeSimple) {
  __makeSimple(obj1);
  __makeSimple(obj2);
}

function additional1() {
  obj1.c = 10;
  delete obj1.b;
  return obj1;
}

function additional2() {
  obj2.c = 5;
  delete obj2.b;
  return obj2;
}

if (global.__optimize) {
  __optimize(additional1);
  __optimize(additional2);
}

inspect = function() {
  let ret1 = additional1();
  let ret2 = additional2();
  let result = 0;
  for (let key in ret1) {
    result += ret1[key];
    result += ret2[key];
  }
  return result;
};
