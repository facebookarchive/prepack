(function() {
  function URI(uri) {
    this.p = "";
    var foo = uri.p;
    maybeThrow(this, foo);
  }

  function maybeThrow(x, foo) {
    if (foo.hello) {
      throw new Error("foo");
    }
    x.p = foo;
    return x;
  }

  var obj;
  function parseHref(rawHref) {
    new URI(rawHref);
    if (!obj) {
      obj = {};
    }
    return 5;
  }

  function App(props) {
    parseHref(new URI(props));
  }

  __optimizeReactComponentTree(App, {
    firstRenderOnly: true,
  });

  module.exports = App;
})();
