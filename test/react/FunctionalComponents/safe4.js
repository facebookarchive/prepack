if (!window.__evaluatePureFunction) {
  window.__evaluatePureFunction = function(f) {
    return f();
  };
}

function foo(props) {
  var abstract = props.props;
  var outer = {};
  var res = __evaluatePureFunction(() => {
    var x = { a: 1 };
    __evaluatePureFunction(() => {
      var y = {};

      // we know `outer` won't change so we don't havoc it:
      abstract(outer);

      // should this havoc `x` or not?
      // my intuition is that it *shouldn't* because the inner scope is "pure".
      // but I think this PR would change that.
      abstract(x);

      // this will havoc `y`:
      abstract(y);
    });
    return x;
  });
  return res.a;
}
function Bar() {
  foo();
}

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(Bar);
}
