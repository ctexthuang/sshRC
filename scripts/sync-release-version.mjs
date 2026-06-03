#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";

const tagName = (process.argv[2] || process.env.GITHUB_REF_NAME || "").trim();

if (!/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(tagName)) {
  throw new Error(`Release tag must look like v1.2.3, v1.2.3-beta.1, or v1.2.3+build.1; got "${tagName}"`);
}

const version = tagName.slice(1);

updateJsonVersion("package.json", version);
updateJsonVersion("src-tauri/tauri.conf.json", version);
updateCargoVersion("src-tauri/Cargo.toml", version);
updateCargoLockVersion("src-tauri/Cargo.lock", "sshcr", version);

console.log(`Synced sshRC internal version to ${version} from ${tagName}`);

function updateJsonVersion(filePath, nextVersion) {
  const value = JSON.parse(readFileSync(filePath, "utf8"));
  value.version = nextVersion;
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function updateCargoVersion(filePath, nextVersion) {
  const content = readFileSync(filePath, "utf8");
  const packageVersionPattern = /(\[package\][\s\S]*?\nversion\s*=\s*")([^"]+)(")/;

  if (!packageVersionPattern.test(content)) {
    throw new Error(`Could not find [package] version in ${filePath}`);
  }

  const updated = content.replace(packageVersionPattern, `$1${nextVersion}$3`);
  writeFileSync(filePath, updated);
}

function updateCargoLockVersion(filePath, packageName, nextVersion) {
  const content = readFileSync(filePath, "utf8");
  const packageNamePattern = escapeRegExp(packageName);
  const packageVersionPattern = new RegExp(
    `(\\[\\[package\\]\\]\\nname = "${packageNamePattern}"\\nversion = ")([^"]+)(")`,
  );

  if (!packageVersionPattern.test(content)) {
    throw new Error(`Could not find package ${packageName} in ${filePath}`);
  }

  const updated = content.replace(packageVersionPattern, `$1${nextVersion}$3`);
  writeFileSync(filePath, updated);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
