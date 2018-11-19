function Component(x, result) {
  this.val = x;
  this.result = result;
  this.do = function(x) {
    return this.val + result;
  }.bind(this);
}

function foo(a, b, c, result) {
  if (!a) {
    return null;
  }
  var _ref11;
  var x = (_ref11 = b) != null ? ((_ref11 = _ref11.feedback) != null ? _ref11.display_comments : _ref11) : _ref11;

  var a = new Component(x, result);
  var func = a.do;

  return c(func);
}

global.__optimize && __optimize(foo);

inspect = function() {
  function func(x) {
    return x();
  }
  var val = foo(
    true,
    {
      feedback: {
        display_comments: 5,
      },
    },
    func,
    10
  );
  return JSON.stringify(val);
};
