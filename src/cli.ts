#!/usr/bin/env bun

import { program } from "commander";

const version = "0.1.0";

program
  .name("giwa")
  .description("GIWA OP Stack L2 developer CLI")
  .version(version)
  .allowExcessArguments(false);

program.parse(process.argv);

if (!process.argv.slice(2).length) {
  program.outputHelp();
}
