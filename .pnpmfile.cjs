function readPackage(pkg) {
  if (pkg.name === "@prisma/config" && pkg.version === "7.10.0") {
    pkg.dependencies = { ...pkg.dependencies, "deepmerge-ts": "8.0.0" };
  }

  if ((pkg.name === "@visx/shape" || pkg.name === "@visx/responsive") && pkg.dependencies?.lodash) {
    pkg.dependencies = { ...pkg.dependencies, lodash: "4.18.1" };
  }

  return pkg;
}

module.exports = { hooks: { readPackage } };
