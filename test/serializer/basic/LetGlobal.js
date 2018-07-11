let x = 0;
var y = 1;

function f() {
  let w = { x: 5 };
  var z = { z: 6 };
  x += 1;
  y += 1;
  let foo = function() {
    w.x += z.z + 1;
  };
  foo();
  return x + w.x + y;
}
inspect = f;
