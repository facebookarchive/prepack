function foo(y) {
  let inc = x => x + 1;
  return y.map(inc);
}

global.__optimize && __optimize(foo);

inspect = () => {
  return foo([7, 8, 9, 10]);
};
