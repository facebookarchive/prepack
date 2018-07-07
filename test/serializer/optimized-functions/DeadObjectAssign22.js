// Copies of _9:3
// _9 is the variable for Object.assign. See DeadObjectAssign4.js for
// a larger explanation.

function f(o2, g, h) {
  let o1 = {};
  g(o1, o2); // leaks o1
  let p = Object.assign({}, o1);
  h(o2); // can mutate o1 !
  let q = Object.assign({}, p);
  return q;
}

if (global.__optimize) __optimize(f);

inspect = function() {
  return f({},
    function(o1, o2) {
      o2.o1 = o1;
    },
    function(o2) {
      o2.o1.x = 42;
    }
  ).x;
}