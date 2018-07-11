function f() {
  var valueA = [];
  var valueB = {};

  function fun1() {
    // no inline =============================================
    // reference valueA then modify it
    let len = valueA.length;
    valueA = [];
    valueA.push("hello");
    return valueA;
  }

  function fun2() {
    // no inline =============================================
    // modify valueB then reference it
    valueB = {};
    valueB.x = "hello";
    return valueB.length;
  }

  function print() {
    // no inline =============================================
    // Reference both valueA and valueB
    return valueA.toString() + valueB.toString();
  }

  return [fun1, fun2, print];
}

var res = f();
var a = res[0];
var b = res[1];
var c = res[2];

inspect = function() {
  let toPrint = b() + " ";
  toPrint += a();
  return toPrint + " " + c();
};
