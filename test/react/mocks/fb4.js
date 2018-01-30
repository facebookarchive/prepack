function App() {}
App.prototype.hi = function() {};

App.arr = [1, 2, 3];
App.otherArray = [];
App.otherArray.length = 10;

global.WrappedApp = require("RelayModern").createFragmentContainer(App);