let func1 = function() {
  let a = 1;
  let b = 2;
  return a + b;
};

let func2 = function(c) {
  let c = func1();
  return c * 2;
};

let d = func2();
