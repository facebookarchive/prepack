// throws introspection error

let x = __abstract("boolean", "true");

let arr = [];

for (let i of [1, 2, 3]) {
  arr[i] = i * 10;
  if (x) continue;
  else break;
}
