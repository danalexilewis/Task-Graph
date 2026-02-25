"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupIntegrationTest = setupIntegrationTest;
exports.teardownIntegrationTest = teardownIntegrationTest;
exports.runTgCli = runTgCli;
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const execa_1 = require("execa");
const migrate_1 = require("../../src/db/migrate");
const utils_1 = require("../../src/cli/utils");
const DOLT_PATH = process.env.DOLT_PATH || "dolt";
if (!process.env.DOLT_PATH)
    process.env.DOLT_PATH = DOLT_PATH;
async function setupIntegrationTest() {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "tg-integration-"));
    const doltRepoPath = path.join(tempDir, ".taskgraph", "dolt");
    const cliPath = path.resolve(__dirname, "../../dist/src/cli/index.js");
    // Create .taskgraph/dolt directory
    fs.mkdirSync(doltRepoPath, { recursive: true });
    // Initialize Dolt repo (use DOLT_PATH so CI/local match)
    await (0, execa_1.execa)(DOLT_PATH, ["init"], {
        cwd: doltRepoPath,
        env: { ...process.env, DOLT_PATH },
    });
    // Write config
    (0, utils_1.writeConfig)({ doltRepoPath: doltRepoPath }, tempDir)._unsafeUnwrap(); // Corrected signature
    // Apply all migrations so test schema matches production
    (await (0, migrate_1.applyMigrations)(doltRepoPath))._unsafeUnwrap();
    (await (0, migrate_1.applyTaskDimensionsMigration)(doltRepoPath))._unsafeUnwrap();
    (await (0, migrate_1.applyTaskDomainSkillJunctionMigration)(doltRepoPath))._unsafeUnwrap();
    (await (0, migrate_1.applyPlanRichFieldsMigration)(doltRepoPath))._unsafeUnwrap();
    (await (0, migrate_1.applyTaskSuggestedChangesMigration)(doltRepoPath))._unsafeUnwrap();
    return { tempDir, doltRepoPath, cliPath };
}
function teardownIntegrationTest(tempDir) {
    if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
}
// Helper to run CLI commands in the integration test context
async function runTgCli(command, cwd, expectError = false) {
    const cliPath = path.resolve(__dirname, "../../dist/src/cli/index.js");
    const TG_BIN = `node ${cliPath} `;
    try {
        const result = await (0, execa_1.execa)(TG_BIN + command, {
            cwd,
            shell: true,
            env: { ...process.env, DOLT_PATH },
        });
        const stdout = result.stdout;
        const stderr = result.stderr;
        const exitCode = result.exitCode ?? 0; // Explicit handling
        if (expectError && exitCode === 0) {
            throw new Error(`Expected command to fail but it succeeded. Output: ${stdout}, Error: ${stderr}`);
        }
        if (!expectError && exitCode !== 0) {
            throw new Error(`Command failed unexpectedly. Exit Code: ${exitCode}, Output: ${result.stdout}, Error: ${result.stderr}`);
        }
        return { stdout: result.stdout, stderr: result.stderr, exitCode };
    }
    catch (error) {
        const execaError = error;
        if (expectError) {
            return {
                stdout: execaError.stdout?.toString() || "",
                stderr: execaError.stderr?.toString() || execaError.message,
                exitCode: execaError.exitCode ?? 1,
            };
        }
        throw error;
    }
}
