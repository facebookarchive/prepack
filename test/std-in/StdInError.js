function hello() {
  return 'Hello';
}
function world() {
  return 'world';
// SyntaxError: Unexpected token
let greeting = hello() + ' ' + world();
console.log(greeting + ' from std-in!');
