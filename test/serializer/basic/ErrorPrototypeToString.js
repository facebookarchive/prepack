function a() {
  let e = new Error("");
  e.name = "";
  return e.toString();
}

function b() {
  let e = new Error("");
  e.name = "b";
  return e.toString();
}

function c() {
  let e = new Error("c");
  e.name = "";
  return e.toString();
}

function d() {
  let e = new Error("c");
  e.name = "c";
  return e.toString();
}

var x = a() + ";" + b() + ";" + c() + ";" + d();
inspect = function() {
  return x;
};
