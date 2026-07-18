import process from "node:process";

const required = [24, 18, 0];
const current = process.versions.node.split(".").map(Number);
const isRequiredMajor = current[0] === required[0];
const versionComparison = current.reduce(
  (result, part, index) => result || part - required[index],
  0,
);
const meetsMinimum = versionComparison >= 0;

if (!isRequiredMajor || !meetsMinimum) {
  console.error(
    `Node runtime audit failed: expected >=${required.join(".")} <25, received ${process.versions.node}.`,
  );
  process.exit(1);
}

console.log(`Node runtime audit passed: ${process.versions.node} (required >=24.18.0 <25).`);
