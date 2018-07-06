// Copies of _A:4
// _A is the variable for Object.assign. See DeadObjectAssign4.js for
// a larger explanation.

function f(o1, o2, g, h) {
  let a = Object.assign({}, o1);
  let b = Object.assign({}, o2);
  g(a, b);
  let p = Object.assign({}, o1);
  h(o2); // can mutate o1 !
  let q = Object.assign({}, p);
  return q;
}

if (global.__optimize) __optimize(f);

inspect = function() {
  return f({}, {}, 
    function(o1, o2) {
      o2.o1 = o1;
    },
    function(o2) {
      o2.o1.x = 42;
    }
  ).x;
}