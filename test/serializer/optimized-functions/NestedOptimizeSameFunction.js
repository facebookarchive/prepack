// expected RecoverableError: PP1009
// does not contain: = 5

function fn() {
  let garbage = 5;
  return "hello";
}

function outer() {
  let garbage = 5;
  global.__optimize && __optimize(fn);
  return "world";
}

global.__optimize && __optimize(fn);
global.__optimize && __optimize(outer);

inspect = function() {
  return outer() + " " + fn();
};
