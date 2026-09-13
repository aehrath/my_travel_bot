const [major, minor] = process.versions.node.split(".").map(Number);

if (major < 22 || (major === 22 && minor < 13)) {
  console.error(
    `My Travel Bot requires Node.js 22.13.0 or newer; you are running ${process.version}.\n` +
    "Run `nvm use` in the project directory (or `nvm install` if needed), then retry.\n" +
    "If launching from an IDE, select the Node.js version specified in .nvmrc as its interpreter.",
  );
  process.exit(1);
}
