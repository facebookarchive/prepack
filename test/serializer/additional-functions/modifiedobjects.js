// does not contain:x = 5;
// does not contain:y = 10;
let toCapture1 = {};
let toCapture2 = 5;
let toCapture3 = {};
Object.defineProperty(global, "foo", { configurable: true, enumerable: false, value: 42 });
Object.defineProperty(global, "bar", {
  configurable: true,
  enumerable: false,
  get: function() {
    return 43;
  },
});

function additional1() {
  toCapture1 = 5;
  toCapture2 = undefined;
  global.foo += 1;
  foo += 1;
  var x = 5;
  x = 10;
  global.x = x;
}

function additional2() {
  var y = 10;
  y = 5;
  toCapture3 = y;
  global.y = y;
}

if (global.__optimize) {
  __optimize(additional1);
  __optimize(additional2);
}

inspect = function inspect() {
  let z = toCapture1;
  let x = toCapture2;
  let y = toCapture3;
  additional1();
  let z2 = toCapture1;
  additional2();

  return (
    "" + z + z2 + x + y + toCapture1 + toCapture2 + toCapture3 + global.foo + global.bar + (global.foo === global.bar)
  );
};
