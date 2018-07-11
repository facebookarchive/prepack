// es6
(function() {
  var myObj = {};
  var otherSym = Symbol("bar");
  myObj["foo"] = "bar";
  myObj[otherSym] = myObj;
  inspect = function() {
    return myObj[otherSym];
  };
})();
