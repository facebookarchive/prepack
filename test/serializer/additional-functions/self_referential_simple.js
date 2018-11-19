// does not contain:x = 5;

function func1() {
  let x = 5;
  let z = func1;
  return z;
}

if (global.__optimize) {
  __optimize(func1);
}

inspect = function() {
  return func1()[0] === func1()[0];
};
