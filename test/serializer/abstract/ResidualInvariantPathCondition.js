// does not contain:42

function checker() {
  let x = global.__abstract ? global.__abstract("boolean", "true") : true;
  global.__assume && global.__assume(x);
  if (!x) {
    global.foo = 42;
  }
}

global.__optimize && __optimize(checker);

inspect = () => {};
