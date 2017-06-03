// recover-from-errors
// expected errors: 3

var a;
//var b = __abstract("boolean");
var b = true;
if(b) {
  var l = __abstract("number");
  a = new Array(l);
  a = new Array(l);
  a = new Array(l);
}
else {
  a = new Array(5);
}
if (a.length) {}
