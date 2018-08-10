// arrayNestedOptimizedFunctionsEnabled

function Component(x) {
  this.val = x;
}

function foo(a, b, c, d) {
  if (!a) {
    return null;
  }
  var arr = Array.from(c);
  var _ref11;
  var x = (_ref11 = b) != null ? ((_ref11 = _ref11.feedback) != null ? _ref11.display_comments : _ref11) : _ref11;

  var a = new Component(x);
  var mappedArr = arr.map(function() {
    return a;
  });
  return d(mappedArr);
}

global.__optimize && __optimize(foo);

inspect = function() {
  function func(arr) {
    return arr.map(item => item.val).join();
  }
  var val = foo(
    true,
    {
      feedback: {
        display_comments: 5,
      },
    },
    [, , ,],
    func
  );
  return JSON.stringify(val);
};
