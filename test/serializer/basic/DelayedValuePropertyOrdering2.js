(function() {
  let x = global.__abstract ? __abstract("boolean", "false") : false;
  let o = { a: undefined, b: {} };
  o.a = o; // delay
  if (x) delete o.a; // might have been deleted

  global.inspect = function() {
    for (let name in o) {
      return name;
    }
  };
})();
