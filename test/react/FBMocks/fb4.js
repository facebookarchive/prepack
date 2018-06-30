if (!this.__evaluatePureFunction) {
  this.__evaluatePureFunction = function(f) {
    return f();
  };
}

function App() {}
App.prototype.hi = function() {};

App.arr = [1, 2, 3];
App.otherArray = [];
App.otherArray.length = 10;

this.WrappedApp = this.__evaluatePureFunction(() => {
  require("React");
  return require("RelayModern").createFragmentContainer(App);
});
