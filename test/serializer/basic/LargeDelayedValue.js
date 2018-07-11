(function() {
  let obj = { a: 1, b: 2, c: 3, d: 4, e: 5, f: 6, g: 7, h: 8, i: 9, j: 10, k: 11, l: 12 };
  global.a = [
    function() {
      return obj;
    },
    function() {
      return obj;
    },
  ];
  inspect = function() {
    global.a[0]().length + global.a[1]().length;
  };
})();
