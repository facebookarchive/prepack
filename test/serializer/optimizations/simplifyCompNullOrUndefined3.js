function f(obj) {
  let y = obj.foo;
  if (y == null) {
    return y === undefined;
  }
}
global.__optimize && __optimize(f);
inspect = () => f({ foo: null });
