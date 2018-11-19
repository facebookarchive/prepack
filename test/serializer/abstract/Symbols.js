// es6
(function() {
  var myObj = {};
  var fooSym = Symbol("foo");
  var otherSym = Symbol("bar");
  myObj["foo"] = "bar";
  myObj[fooSym] = "baz";
  myObj[otherSym] = "bing";
  inspect = function() {
    return myObj[otherSym];
  };
})();
