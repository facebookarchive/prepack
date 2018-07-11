// does not contain:= 7;
// does not contain:= 10;

function additional1() {
  var x2 = { foo: 5 };
  foo = function() {
    return x2;
  };
  var y = 7;
}

function additional2() {
  let x = 10;
}

if (global.__optimize) {
  __optimize(additional1);
  __optimize(additional2);
}

inspect = function() {
  additional1();
  additional2();
  let ret1 = global.foo();
  let ret2 = global.foo();
  ret1.x += 9;

  return " " + JSON.stringify(ret1) + JSON.stringify(ret2) + (ret1 === ret2);
};
