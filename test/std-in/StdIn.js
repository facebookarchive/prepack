// @flow
function hello() {
  return "Hello";
}
function world() {
  return "world";
}
let greeting = hello() + " " + world();
console.log(greeting + " from std-in");
