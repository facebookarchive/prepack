// expected errors: [{"location":{"start":{"line":6,"column":11},"end":{"line":6,"column":29},"source":"test/error-handler/objectExpression2.js"},"severity":"FatalError","errorCode":"PP0011"}]

let x = __abstract("number");
let y = __abstract("number");

let ob = { [x]: function() {}, [y]: 2 };
