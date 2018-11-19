// Copies of _\$8\(:3
// Copies of var _\$8 = _\$7.assign;:1
// inline expressions

// _$8 is the variable for Object.assign. See DeadObjectAssign4.js for
// a larger explanation.

function f(o) {
  var p = Object.assign({}, o, { a: 1 });
  var q = Object.assign({}, p, { a: 3 });
  var p2 = Object.assign({}, o, { a: 2 });
  var q2 = Object.assign({}, p2, { a: 4 });
  return [q, q2];
}

if (global.__optimize) __optimize(f);

global.inspect = function() {
  return JSON.stringify(f({ a: 10 }));
};

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
  return f(
    {},
    {},
    function(o1, o2) {
      o2.o1 = o1;
    },
    function(o2) {
      o2.o1.x = 42;
    }
  ).x;
};
