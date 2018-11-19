let outermost;
function foo() {
  let inner1 = 0;
  return [() => inner1, () => inner1++];
}
(function() {
  let outer;
  let [getter, incrementer] = foo();
  function toOptimize() {
    let inner2;
    incrementer();
    return getter();
  }
  global.bar = toOptimize;
  global.getter = getter;
  global.__optimize && global.__optimize(toOptimize);
})();

global.inspect = function() {
  let x = global.getter();
  let y = global.bar();
  let z = global.getter();
  return x + " " + y + " " + z;
};
