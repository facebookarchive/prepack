// does contain:=> {

const foo = x => {
  return x + 1;
};

if (global.__optimize) __optimize(foo);

inspect = function() {
  return foo(5);
};
