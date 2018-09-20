(function() {
  function URIBase(uri) {
    if (uri instanceof URIBase) {
      serialize(uri.x);
      this.x = undefined;
    }
  }

  function serialize(obj) {
    for (var k in obj) {
    }
  }

  function App(props) {
    new URIBase(new URIBase(props));
    return null;
  }

  if (global.__optimize) __optimize(App);

  global.App = App;

  inspect = function() {
    return true;
  }; // just make sure Prepack doesn't crash while generating code
})();
