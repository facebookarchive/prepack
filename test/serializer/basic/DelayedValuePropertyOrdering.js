(function() {
  let o = { a: undefined, b: {} };
  o.a = o;

  global.inspect = function() {
    for (let name in o) {
      return name;
    }
  };
})();
