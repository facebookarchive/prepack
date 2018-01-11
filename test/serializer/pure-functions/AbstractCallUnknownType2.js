// additional functions
// abstract effects

let obj = {};
if (global.__makeSimple) {
  __makeSimple(obj);
}
if (global.__makePartial) {
  __makePartial(obj);
}
let condition = global.__abstract ? __abstract('boolean', 'false') : false;

function additional1() {
  return obj.foo();
}

function additional2() {
  function fn() {
    return 5;
  }
  let fnOrString = condition ? fn : 'string';
  return fnOrString();
}

inspect = function() {
  let didThrow1 = false;
  let didThrow2 = false;
  try {
    additional1();
  } catch (x) {
    didThrow1 = true;
  }
  try {
    additional2();
  } catch (x) {
    didThrow2 = true;
  }
  return didThrow1 + ', ' + didThrow2;
}
