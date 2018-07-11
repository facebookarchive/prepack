(function() {
  function f(y) {
    let x = 0;
    return function() {
      return [x++, y.value];
    };
  }
  let f1 = f({ value: 1 });
  let f2 = f({ value: 2 });
  let f3 = f({ value: 3 });
  inspect = function() {
    f1()[1] + f2()[1] + f3()[1];
  };
})();
