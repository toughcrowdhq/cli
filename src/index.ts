#!/usr/bin/env node

import { run } from "./cli.js";
import { readPackageVersion } from "./version.js";

run({ args: process.argv.slice(2), version: readPackageVersion() });
