let greeting = "Hello";
let now = Date.now();
let future = +new Date(2000, 1, 1);
if (now > future) {
  greeting = "Hey";
}
module.exports = greeting;
