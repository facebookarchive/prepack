let outermost;
(function() {
  let outer = 0;
  function toOptimize() {
    function foo() {
      let inner1 = outer;
      return [() => inner1, () => inner1++];
    }
    global.__optimize && global.__optimize(foo);
    let [getter, incrementer] = foo();
    let inner2;
    global.getter = getter;
    incrementer();
    return getter();
  }
  global.bar = toOptimize;
  global.__optimize && global.__optimize(toOptimize);
})();

global.inspect = function() {
  let x = global.getter();
  let y = global.bar();
  let z = global.getter();
  return x + " " + y + " " + z;
};
