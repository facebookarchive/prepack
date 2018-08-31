try {
  try {
    const b = __abstract("boolean", "false");
    if (b) throw new Error("throw");
  } catch (error) {}
} catch (error) {
  console.log(error.message);
}
