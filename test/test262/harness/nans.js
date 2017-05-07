/**
 * A collection of NaN values produced from expressions that have been observed
 * to create distinct bit representations on various platforms. These provide a
 * weak basis for assertions regarding the consistent canonicalization of NaN
 * values in Array buffers.
 */
var distinctNaNs = [
  0/0, Infinity/Infinity, -(0/0), Math.pow(-1, 0.5), -Math.pow(-1, 0.5)
];
