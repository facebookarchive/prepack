// expected errors: [{"location":{"start":{"line":6,"column":14},"end":{"line":6,"column":16},"identifierName":"ob","source":"test/error-handler/forInStatement.js"},"severity":"FatalError","errorCode":"PP0013"}]

let ob = global.__abstract ? __abstract("object", "({ x: 1 })") : { x: 1 };

let tgt = {};
for (var p in ob) {
}
